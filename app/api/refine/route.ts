import { NextResponse } from "next/server";
import OpenAI from "openai";

// Re-use shared helpers from the draft route
import {
  safeTrim,
  splitToBilingual,
  normalizeDivider,
  stripAccidentalSignature,
  prependSalutation,
  attachSignatureByLanguage,
  languageOutputOK,
  parseModelJSON,
  callModelOnce,
  SENDER_SIGNATURE,
} from "../draft/route";

export const runtime = "nodejs";

type RefineRequest = {
  subject: string;
  body: string;
  language?: "Japanese" | "English" | "Bilingual";
  tone?: "Polite" | "Neutral" | "Administrative";
  to?: string;
  purposeNote?: string; // optional context; not used to change meaning
};

/** Strip the system-attached salutation and signature before sending to the
 *  model, so it doesn't try to "refine" them as if they were user content. */
function stripSalutationAndSignature(opts: {
  body: string;
  language: "Japanese" | "English" | "Bilingual";
  toJp: string;
  toEn: string;
}): string {
  const { language, toJp, toEn } = opts;
  let t = opts.body.trim();

  // Remove signature first (shared helper already handles this)
  t = stripAccidentalSignature(t);

  // Remove salutation lines we prepended (first non-empty line if it matches the To field)
  function removeSalutation(text: string, salutation: string): string {
    if (!salutation) return text;
    const escaped = salutation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`^${escaped}\\s*\\n+`), "").trim();
  }

  if (language === "Japanese") {
    return removeSalutation(t, toJp);
  }
  if (language === "English") {
    return removeSalutation(t, toEn);
  }

  // Bilingual: strip salutation from each half
  const normalized = normalizeDivider(t);
  const parts = normalized.split("\n-----\n");
  if (parts.length === 2) {
    const jp = removeSalutation(parts[0].trim(), toJp);
    const en = removeSalutation(parts[1].trim(), toEn);
    return `${jp}\n-----\n${en}`.trim();
  }
  return t;
}

function refineSystemPrompt(language: "Japanese" | "English" | "Bilingual"): string {
  const base = `
You are an email refinement assistant for a Japanese university department chair.

ROLE (STRICT):
- Sender is ALWAYS Hitoshi Eguchi.
- Write ONLY from Eguchi's perspective.

YOUR TASK:
- The user has already edited this draft for accuracy and content.
- Treat the user-edited subject and body as the authoritative source of truth.
- Refine ONLY: wording, grammar, tone, and naturalness.
- Do NOT change the user's meaning, intended action, or decision.
- Do NOT add new claims or remove important information.
- Do NOT change names, dates, numbers, or commitments.
- Do NOT rewrite the message from scratch.

GREETING / SIGNATURE (STRICT):
- Do NOT include any greeting line (no recipient name line).
- Do NOT include any signature lines or sender name.
  The system will prepend the greeting and attach the signature.

OUTPUT (STRICT):
- Return ONLY valid JSON: {"subject":"...","body":"..."}
- No markdown, no extra keys.

LANGUAGE:
- Japanese: Japanese subject+body
- English: English subject+body
- Bilingual: Japanese, then exactly "\\n-----\\n", then English
`.trim();

  if (language === "English") {
    return (
      base +
      `

HARD ENGLISH REQUIREMENT:
- The entire subject and body MUST be English.
- Do NOT use Japanese characters.
`
    ).trim();
  }
  if (language === "Japanese") {
    return (
      base +
      `

HARD JAPANESE REQUIREMENT:
- The entire subject and body MUST be Japanese.
- Do NOT use English sentences in the body.
`
    ).trim();
  }
  return (
    base +
    `

HARD BILINGUAL REQUIREMENT:
- Japanese first, then exactly "\\n-----\\n", then English.
- Japanese block MUST be Japanese.
- English block MUST be English (no Japanese characters).
`
  ).trim();
}

function refineUserPrompt(args: {
  subject: string;
  bodyStripped: string;
  language: "Japanese" | "English" | "Bilingual";
  tone: "Polite" | "Neutral" | "Administrative";
  purposeNote?: string;
}): string {
  return `
TASK:
Refine the user-edited email draft below.

USER-EDITED SUBJECT:
${args.subject}

USER-EDITED BODY (greeting and signature already removed):
${args.bodyStripped}

${args.purposeNote ? `ORIGINAL CONTEXT (for reference only — do not override the user's edits):\n${args.purposeNote}` : ""}

SETTINGS:
- language: ${args.language}
- tone: ${args.tone}

REMINDERS:
- Preserve the user's meaning, decision, and all factual content exactly.
- Refine only clarity, grammar, naturalness, and tone.
- No greeting line. No signature. Output strict JSON only.
`.trim();
}

export async function POST(req: Request) {
  try {
    const data = (await req.json()) as RefineRequest;

    const subject = safeTrim(data.subject, 300);
    const body = safeTrim(data.body, 20000);

    if (!subject || !body) {
      return NextResponse.json(
        { error: "Subject and body are required for refinement." },
        { status: 400 }
      );
    }

    const language: "Japanese" | "English" | "Bilingual" =
      data.language ?? "Japanese";
    const tone: "Polite" | "Neutral" | "Administrative" =
      data.tone ?? "Administrative";
    const purposeNote = safeTrim(data.purposeNote ?? "", 2000);

    const { jp: toJp, en: toEn } = splitToBilingual(data.to);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in environment." },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    // Strip the system-prepended salutation + signature before sending to model
    const bodyStripped = stripSalutationAndSignature({ body, language, toJp, toEn });

    const systemPrompt = refineSystemPrompt(language);
    const uContent = refineUserPrompt({ subject, bodyStripped, language, tone, purposeNote });

    // First attempt
    let out = await callModelOnce({
      client,
      model,
      systemPrompt,
      userContent: uContent,
      temperature: 0.2,
    });

    // Retry with hard prompt if language check fails
    if (!languageOutputOK(language, out.body)) {
      out = await callModelOnce({
        client,
        model,
        systemPrompt: refineSystemPrompt(language), // already "hard" for refine
        userContent: uContent,
        temperature: 0.0,
      });

      if (!languageOutputOK(language, out.body)) {
        return NextResponse.json(
          {
            error: "Refined output did not match requested language/format.",
            detail: "Please try again.",
          },
          { status: 500 }
        );
      }
    }

    const refinedSubject = safeTrim(out.subject, 300);
    const refinedBody = safeTrim(out.body, 20000);

    // Re-attach salutation + signature
    const bodyWithSalutation = prependSalutation({
      body: refinedBody,
      language,
      toJp,
      toEn,
    });
    const finalBody = attachSignatureByLanguage({
      body: bodyWithSalutation,
      language,
    });

    return NextResponse.json({ subject: refinedSubject, body: finalBody });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Refinement failed", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
