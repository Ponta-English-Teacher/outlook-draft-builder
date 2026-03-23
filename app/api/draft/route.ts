import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

export const SENDER_SIGNATURE = {
  jp: `江口　均
北星学園大学
英文学科`,
  en: `Hitoshi Eguchi
English Department
Hokusei Gakuen University`,
};

type Mode = "reply" | "scratch";

type DraftRequest = {
  mode?: Mode;
  requestText?: string;
  purposeNote?: string;
  language?: "Japanese" | "English" | "Bilingual";
  tone?: "Polite" | "Neutral" | "Administrative";
  to?: string;
};

type DraftResponse = { subject: string; body: string };

export function safeTrim(s: unknown, maxLen = 20000): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

/** newest at top; cut before first quoted header marker */
function extractLatestIncomingMessage(fullThread: string): {
  replyTarget: string;
  background: string;
  cutReason: string;
} {
  const background = fullThread.trim();
  if (!background) return { replyTarget: "", background: "", cutReason: "empty" };

  const markerRe =
    /^(差出人:|送信日時:|宛先:|件名:|From:|Sent:|To:|Subject:)\s*/m;

  const m = background.match(markerRe);
  if (!m || typeof m.index !== "number") {
    return { replyTarget: background, background, cutReason: "no-marker" };
  }

  const replyTarget = background.slice(0, m.index).trim();
  return {
    replyTarget: replyTarget || background,
    background,
    cutReason: `cut-before:${m[0].trim()}`,
  };
}

export function splitToBilingual(toRaw: unknown): { jp: string; en: string } {
  const s = String(toRaw ?? "").trim();
  if (!s) return { jp: "", en: "" };

  const parts = s.split("/").map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) return { jp: parts[0], en: parts[1] };

  return { jp: s, en: s };
}

export function normalizeDivider(body: string): string {
  let t = body;
  t = t.replace(/\n[-‐-–—]{3,}\n/g, "\n-----\n");
  t = t.replace(/\n\s*-----\s*\n/g, "\n-----\n");
  return t;
}

export function stripAccidentalSignature(text: string): string {
  let t = text.trimEnd();

  const patterns: RegExp[] = [
    /\n{1,3}――――――――――[\s\S]*$/u,
    /\n{1,3}[-‐-–—]{3,}\s*$/u,
    /\n{1,3}(Hitoshi\s+Eguchi|江口\s*均|江口)\s*(,.*)?\s*$/iu,
    /\n{1,3}(English\s+Department|北星学園大学|英文学科)\s*$/iu,
  ];

  for (let i = 0; i < 4; i++) {
    const before = t;
    for (const re of patterns) t = t.replace(re, "");
    if (t === before) break;
    t = t.trimEnd();
  }

  return t.trim();
}

export function prependSalutation(opts: {
  body: string;
  language: "Japanese" | "English" | "Bilingual";
  toJp: string;
  toEn: string;
}): string {
  const { body, language, toJp, toEn } = opts;
  const t = body.trim();

  if (language === "Japanese") return toJp ? `${toJp}\n\n${t}` : t;
  if (language === "English") return toEn ? `${toEn}\n\n${t}` : t;

  const normalized = normalizeDivider(t);
  const parts = normalized.split("\n-----\n");
  if (parts.length === 2) {
    const jp = parts[0].trim();
    const en = parts[1].trim();
    const jpOut = toJp ? `${toJp}\n\n${jp}` : jp;
    const enOut = toEn ? `${toEn}\n\n${en}` : en;
    return `${jpOut}\n-----\n${enOut}`.trim();
  }

  return t;
}

export function attachSignatureByLanguage(opts: {
  body: string;
  language: "Japanese" | "English" | "Bilingual";
}): string {
  const language = opts.language;
  let finalBody = normalizeDivider(stripAccidentalSignature(opts.body));

  if (language === "Japanese") {
    if (!finalBody.includes(SENDER_SIGNATURE.jp)) {
      finalBody = `${finalBody}\n\n${SENDER_SIGNATURE.jp}`;
    }
    return finalBody;
  }

  if (language === "English") {
    if (!finalBody.includes(SENDER_SIGNATURE.en)) {
      finalBody = `${finalBody}\n\n${SENDER_SIGNATURE.en}`;
    }
    return finalBody;
  }

  const parts = finalBody.split("\n-----\n");
  if (parts.length === 2) {
    const jpPartRaw = parts[0].trim();
    const enPartRaw = parts[1].trim();

    const jpPart = jpPartRaw.includes(SENDER_SIGNATURE.jp)
      ? jpPartRaw
      : `${jpPartRaw}\n\n${SENDER_SIGNATURE.jp}`;

    const enPart = enPartRaw.includes(SENDER_SIGNATURE.en)
      ? enPartRaw
      : `${enPartRaw}\n\n${SENDER_SIGNATURE.en}`;

    return `${jpPart}\n-----\n${enPart}`.trim();
  }

  if (!finalBody.includes(SENDER_SIGNATURE.jp)) {
    finalBody = `${finalBody}\n\n${SENDER_SIGNATURE.jp}`;
  }
  return finalBody;
}

/** ===== Language validation ===== */

export function countJapaneseChars(s: string): number {
  const m = s.match(/[\u3040-\u30ff\u3400-\u9fff]/g);
  return m ? m.length : 0;
}

export function countLatinLetters(s: string): number {
  const m = s.match(/[A-Za-z]/g);
  return m ? m.length : 0;
}

export function isEnglishEnough(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  const jp = countJapaneseChars(t);
  const en = countLatinLetters(t);
  return jp <= 3 && en >= 20;
}

export function isJapaneseEnough(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  const jp = countJapaneseChars(t);
  return jp >= 10;
}

export function isBilingualFormatOK(s: string): boolean {
  const t = normalizeDivider(s.trim());
  const parts = t.split("\n-----\n");
  if (parts.length !== 2) return false;
  return isJapaneseEnough(parts[0]) && isEnglishEnough(parts[1]);
}

export function languageOutputOK(
  language: "Japanese" | "English" | "Bilingual",
  body: string
): boolean {
  const t = body.trim();
  if (!t) return false;
  if (language === "Bilingual") return isBilingualFormatOK(t);
  if (language === "English") return isEnglishEnough(t);
  return isJapaneseEnough(t);
}

/** ===== Prompts ===== */

function systemPromptBase(): string {
  return `
You are an email drafting assistant for a Japanese university department chair.

ROLE (STRICT):
- Sender is ALWAYS Hitoshi Eguchi.
- Write ONLY from Eguchi's perspective.
- Never write as the recipient or as another office.

GREETING / SIGNATURE (STRICT):
- Do NOT include any greeting line (no recipient name line).
  The system will prepend it from the Step 3 "To" field.
- Do NOT include any signature lines or sender name.
  The system will attach the signature.

TONE:
- Start with a brief polite acknowledgment ("Thank you for your message" / "ご連絡ありがとうございます"),
  then confirm, then state what you will do.

OUTPUT (STRICT):
- Return ONLY valid JSON: {"subject":"...","body":"..."}
- No markdown, no extra keys.

LANGUAGE:
- Japanese: Japanese subject+body
- English: English subject+body
- Bilingual: Japanese, then exactly "\\n-----\\n", then English
`.trim();
}

function systemPromptHard(language: "Japanese" | "English" | "Bilingual"): string {
  const base = systemPromptBase();
  if (language === "English") {
    return (
      base +
      `

HARD ENGLISH REQUIREMENT:
- The entire subject and body MUST be English.
- Do NOT use Japanese characters at all in the body.
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

/**
 * Classify Step 2 input: is it a rough draft, or a purpose/instruction note?
 * Heuristic: if it's multi-sentence and reads like a message body, treat as draft.
 */
function classifyPurposeNote(note: string): "draft" | "instruction" {
  const t = note.trim();
  if (!t) return "instruction";
  // Rough heuristic: 3+ lines or 80+ characters with sentence-ending punctuation => likely a draft
  const lines = t.split("\n").filter((l) => l.trim().length > 0);
  const hasSentenceEnd = /[。！？.!?]/.test(t);
  if ((lines.length >= 3 || t.length >= 80) && hasSentenceEnd) return "draft";
  return "instruction";
}

function userPrompt(args: {
  mode: Mode;
  replyTarget: string;
  backgroundThread: string;
  purposeNote: string;
  language: "Japanese" | "English" | "Bilingual";
  tone: "Polite" | "Neutral" | "Administrative";
}): string {
  const noteType = classifyPurposeNote(args.purposeNote);

  if (args.mode === "scratch") {
    if (noteType === "draft") {
      return `
TASK:
The user has written a rough draft of the email they want to send.
Rewrite it as a polished, professional email.

IMPORTANT:
- Preserve the user's intended meaning, decision, and action exactly.
- Preserve all factual content (names, dates, numbers, commitments).
- Do NOT introduce new claims or remove important information.
- Only improve clarity, grammar, naturalness, and tone.

USER'S ROUGH DRAFT:
${args.purposeNote}

REFERENCE TEXT (optional; may be blank):
${args.backgroundThread || "(none)"}

SETTINGS:
- language: ${args.language}
- tone: ${args.tone}

REMINDERS:
- No greeting line. No signature. Output strict JSON only.
`.trim();
    }

    return `
TASK:
Draft a NEW email (not a reply).

GOAL / REQUEST (WHAT THE EMAIL SHOULD ACHIEVE):
${args.replyTarget}

REFERENCE TEXT (optional; may be blank):
${args.backgroundThread || "(none)"}

PURPOSE NOTE / INSTRUCTIONS (optional):
${args.purposeNote || "(none)"}

SETTINGS:
- language: ${args.language}
- tone: ${args.tone}

REMINDERS:
- No greeting line. No signature. Output strict JSON only.
`.trim();
  }

  // reply mode
  if (noteType === "draft") {
    return `
TASK:
The user has written a rough draft reply to the received message below.
Rewrite it as a polished, professional reply.

IMPORTANT:
- Preserve the user's intended meaning, decision, and action exactly.
- Preserve all factual content (names, dates, numbers, commitments).
- Do NOT introduce new claims or remove important information.
- Only improve clarity, grammar, naturalness, and tone.
- Ensure it is appropriate as a reply to the RECEIVED MESSAGE below.

USER'S ROUGH DRAFT:
${args.purposeNote}

RECEIVED MESSAGE (for context):
${args.replyTarget}

BACKGROUND CONTEXT (REFERENCE ONLY):
${args.backgroundThread}

SETTINGS:
- language: ${args.language}
- tone: ${args.tone}

REMINDERS:
- No greeting line. No signature. Output strict JSON only.
`.trim();
  }

  return `
TASK:
Draft an email reply.

YOUR PRIMARY INSTRUCTION (FOLLOW THIS EXACTLY — THIS OVERRIDES EVERYTHING ELSE):
${args.purposeNote || "(none)"}

This instruction represents the sender's communication decision.
You MUST follow it exactly, even if it contradicts what a "normal" reply would do.

CRITICAL RULES:
- The PRIMARY INSTRUCTION above is the only thing you are optimizing for.
- Do NOT automatically respond to all content in the original message.
- Do NOT expand into a full reply unless the instruction says to.
- Do NOT confirm every point in the original message.
- Do NOT introduce actions, commitments, or next steps not stated in the instruction.
- If the instruction indicates a short acknowledgment, reply later, or defer — write ONLY that. Nothing more.
- If the instruction says to keep it short, keep it short. One or two sentences is acceptable and correct.
- The original message is background context only. It tells you what was received. It does NOT tell you what to write.

ORIGINAL MESSAGE (BACKGROUND CONTEXT ONLY — DO NOT TREAT AS A CHECKLIST TO RESPOND TO):
${args.replyTarget}

SETTINGS:
- language: ${args.language}
- tone: ${args.tone}

REMINDERS:
- No greeting line. No signature. Output strict JSON only.
`.trim();
}

export function parseModelJSON(text: string): DraftResponse {
  const raw = (text || "").trim();
  try {
    const obj = JSON.parse(raw);
    return {
      subject: safeTrim(obj.subject, 300),
      body: safeTrim(obj.body, 20000),
    };
  } catch {}

  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    const obj = JSON.parse(m[0]);
    return {
      subject: safeTrim(obj.subject, 300),
      body: safeTrim(obj.body, 20000),
    };
  }
  throw new Error("Model did not return valid JSON.");
}

export async function callModelOnce(opts: {
  client: OpenAI;
  model: string;
  systemPrompt: string;
  userContent: string;
  temperature: number;
}): Promise<DraftResponse> {
  const completion = await opts.client.chat.completions.create({
    model: opts.model,
    temperature: opts.temperature,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userContent },
    ],
  });

  const text = completion.choices?.[0]?.message?.content ?? "";
  return parseModelJSON(text);
}

export async function POST(req: Request) {
  try {
    const data = (await req.json()) as DraftRequest;

    const mode: Mode = data.mode === "scratch" ? "scratch" : "reply";

    const requestText = safeTrim(data.requestText ?? "", 50000);
    const purposeNote = safeTrim(data.purposeNote ?? "", 2000);

    const language: "Japanese" | "English" | "Bilingual" =
      data.language ?? "Japanese";
    const tone: "Polite" | "Neutral" | "Administrative" =
      data.tone ?? "Administrative";

    const { jp: toJp, en: toEn } = splitToBilingual(data.to);

    const hasRequest = requestText.length > 0;
    const hasPurpose = purposeNote.length > 0;

    if (mode === "reply" && !hasRequest) {
      return NextResponse.json(
        { error: "requestText is required in Reply mode." },
        { status: 400 }
      );
    }

    if (mode === "scratch" && !hasRequest && !hasPurpose) {
      return NextResponse.json(
        {
          error:
            "Please write your goal or a rough draft in Step 2 (or paste reference text in Step 1).",
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in environment." },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    let replyTarget = "";
    let background = "";

    if (mode === "reply") {
      const extracted = extractLatestIncomingMessage(requestText);
      replyTarget = extracted.replyTarget;
      background = extracted.background;
    } else {
      replyTarget = purposeNote || requestText || "(no goal provided)";
      background = requestText || "";
    }

    const uContent = userPrompt({
      mode,
      replyTarget,
      backgroundThread: background,
      purposeNote,
      language,
      tone,
    });

    // First attempt
    let out = await callModelOnce({
      client,
      model,
      systemPrompt: systemPromptBase(),
      userContent: uContent,
      temperature: 0.2,
    });

    // Retry with hard prompt if language check fails
    if (!languageOutputOK(language, out.body)) {
      out = await callModelOnce({
        client,
        model,
        systemPrompt: systemPromptHard(language),
        userContent: uContent,
        temperature: 0.0,
      });

      if (!languageOutputOK(language, out.body)) {
        return NextResponse.json(
          {
            error: "Model output did not match requested language/format.",
            detail:
              "Please try again. (If this repeats, we can switch to a more strict model setting.)",
          },
          { status: 500 }
        );
      }
    }

    const subject = safeTrim(out.subject, 300);
    const body = safeTrim(out.body, 20000);

    const bodyWithSalutation = prependSalutation({ body, language, toJp, toEn });
    const finalBody = attachSignatureByLanguage({ body: bodyWithSalutation, language });

    return NextResponse.json({ subject, body: finalBody });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}