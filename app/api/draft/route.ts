import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const SENDER_SIGNATURE = {
  jp: `江口　均
北星学園大学
英文学科`,
  en: `Hitoshi Eguchi
English Department
Hokusei Gakuen University`,
};

type Mode = "reply" | "scratch";

type DraftRequest = {
  // NEW: supports both reply and from-scratch
  mode?: Mode;

  requestText?: string;
  purposeNote?: string;
  language?: "Japanese" | "English" | "Bilingual";
  tone?: "Polite" | "Neutral" | "Administrative";
  to?: string; // e.g. "今枝さん/Mr. Imaeda"
};

type DraftResponse = { subject: string; body: string };

function safeTrim(s: unknown, maxLen = 20000): string {
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

function splitToBilingual(toRaw: unknown): { jp: string; en: string } {
  const s = String(toRaw ?? "").trim();
  if (!s) return { jp: "", en: "" };

  const parts = s.split("/").map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) return { jp: parts[0], en: parts[1] };

  return { jp: s, en: s };
}

function normalizeDivider(body: string): string {
  let t = body;
  t = t.replace(/\n[-‐-–—]{3,}\n/g, "\n-----\n");
  t = t.replace(/\n\s*-----\s*\n/g, "\n-----\n");
  return t;
}

function stripAccidentalSignature(text: string): string {
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

function prependSalutation(opts: {
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

  // If divider missing, keep as-is (we will enforce via retry below)
  return t;
}

function attachSignatureByLanguage(opts: {
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

  // Divider missing: fallback to JP signature (safer than mixing)
  if (!finalBody.includes(SENDER_SIGNATURE.jp)) {
    finalBody = `${finalBody}\n\n${SENDER_SIGNATURE.jp}`;
  }
  return finalBody;
}

/** ===== Language validation (server-side guard) ===== */

function countJapaneseChars(s: string): number {
  // Hiragana, Katakana, Han (CJK)
  const m = s.match(/[\u3040-\u30ff\u3400-\u9fff]/g);
  return m ? m.length : 0;
}

function countLatinLetters(s: string): number {
  const m = s.match(/[A-Za-z]/g);
  return m ? m.length : 0;
}

function isEnglishEnough(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  const jp = countJapaneseChars(t);
  const en = countLatinLetters(t);
  // English mode must not be Japanese-heavy
  return jp <= 3 && en >= 20;
}

function isJapaneseEnough(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  const jp = countJapaneseChars(t);
  return jp >= 10;
}

function isBilingualFormatOK(s: string): boolean {
  const t = normalizeDivider(s.trim());
  const parts = t.split("\n-----\n");
  if (parts.length !== 2) return false;
  return isJapaneseEnough(parts[0]) && isEnglishEnough(parts[1]);
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

// NEW: user prompt now supports both reply and scratch modes
function userPrompt(args: {
  mode: Mode;
  replyTarget: string;
  backgroundThread: string;
  purposeNote: string;
  language: "Japanese" | "English" | "Bilingual";
  tone: "Polite" | "Neutral" | "Administrative";
}): string {
  if (args.mode === "scratch") {
    return `
TASK:
Draft a NEW email (not a reply).

GOAL / REQUEST (WHAT THE EMAIL SHOULD ACHIEVE):
${args.replyTarget}

REFERENCE TEXT (optional; may be blank):
${args.backgroundThread || "(none)"}

PURPOSE NOTE (optional):
${args.purposeNote || "(none)"}

SETTINGS:
- language: ${args.language}
- tone: ${args.tone}

REMINDERS:
- No greeting line. No signature. Output strict JSON only.
`.trim();
  }

  // reply mode (original behavior)
  return `
TASK:
Draft an email reply.

REPLY TARGET (RESPOND ONLY TO THIS):
${args.replyTarget}

BACKGROUND CONTEXT (REFERENCE ONLY — DO NOT RESPOND DIRECTLY):
${args.backgroundThread}

PURPOSE NOTE (optional):
${args.purposeNote || "(none)"}

SETTINGS:
- language: ${args.language}
- tone: ${args.tone}

REMINDERS:
- Respond ONLY to REPLY TARGET.
- No greeting line. No signature. Output strict JSON only.
`.trim();
}

function parseModelJSON(text: string): DraftResponse {
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

async function callModelOnce(opts: {
  client: OpenAI;
  model: string;
  mode: Mode;
  language: "Japanese" | "English" | "Bilingual";
  tone: "Polite" | "Neutral" | "Administrative";
  replyTarget: string;
  background: string;
  purposeNote: string;
  temperature: number;
  hard: boolean;
}): Promise<DraftResponse> {
  const sys = opts.hard ? systemPromptHard(opts.language) : systemPromptBase();

  const completion = await opts.client.chat.completions.create({
    model: opts.model,
    temperature: opts.temperature,
    messages: [
      { role: "system", content: sys },
      {
        role: "user",
        content: userPrompt({
          mode: opts.mode,
          replyTarget: opts.replyTarget,
          backgroundThread: opts.background,
          purposeNote: opts.purposeNote,
          language: opts.language,
          tone: opts.tone,
        }),
      },
    ],
  });

  const text = completion.choices?.[0]?.message?.content ?? "";
  return parseModelJSON(text);
}

function languageOutputOK(
  language: "Japanese" | "English" | "Bilingual",
  body: string
): boolean {
  const t = body.trim();
  if (!t) return false;

  if (language === "Bilingual") return isBilingualFormatOK(t);
  if (language === "English") return isEnglishEnough(t);
  return isJapaneseEnough(t);
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

    // NEW: validation depends on mode
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
        { error: "purposeNote is required in From-scratch mode (when Step 1 is empty)." },
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

    // NEW: choose replyTarget/background depending on mode
    let replyTarget = "";
    let background = "";

    if (mode === "reply") {
      const extracted = extractLatestIncomingMessage(requestText);
      replyTarget = extracted.replyTarget;
      background = extracted.background;
    } else {
      // From-scratch: the "goal" is the main target.
      // If Step 1 has reference text, treat it as background context.
      replyTarget = purposeNote || requestText || "(no goal provided)";
      background = requestText || "";
    }

    // First attempt (normal)
    let out = await callModelOnce({
      client,
      model,
      mode,
      language,
      tone,
      replyTarget,
      background,
      purposeNote,
      temperature: 0.2,
      hard: false,
    });

    // Validate language/format; if wrong, retry once (hard + temp 0)
    if (!languageOutputOK(language, out.body)) {
      out = await callModelOnce({
        client,
        model,
        mode,
        language,
        tone,
        replyTarget,
        background,
        purposeNote,
        temperature: 0.0,
        hard: true,
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

    // 1) prepend greeting(s)
    const bodyWithSalutation = prependSalutation({
      body,
      language,
      toJp,
      toEn,
    });

    // 2) attach signatures by the SELECTED language (never infer)
    const finalBody = attachSignatureByLanguage({
      body: bodyWithSalutation,
      language,
    });

    return NextResponse.json({ subject, body: finalBody });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}