import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

export const SENDER_SIGNATURE = {
  jp: `北星学園大学
英文学科

江口　均`,
  en: `Hitoshi Eguchi
English Department
Hokusei Gakuen University`,
};

type Mode = "reply" | "scratch";
type Intent = "default" | "full" | "acknowledge" | "delay" | "question" | "rewrite";
type Language = "Japanese" | "English" | "Bilingual";
type Tone = "Administrative" | "Business-polite" | "Friendly-professional" | "Casual";

type DraftRequest = {
  mode?: Mode;
  intent?: Intent;
  requestText?: string;
  purposeNote?: string;
  language?: Language;
  tone?: Tone;
  to?: string;
};

type DraftResponse = { subject: string; body: string };

export function safeTrim(s: unknown, maxLen = 20000): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

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
  language: Language;
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
  language: Language;
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

export function languageOutputOK(language: Language, body: string): boolean {
  const t = body.trim();
  if (!t) return false;
  if (language === "Bilingual") return isBilingualFormatOK(t);
  if (language === "English") return isEnglishEnough(t);
  return isJapaneseEnough(t);
}

function toneInstruction(tone: Tone): string {
  if (tone === "Administrative") {
    return "Administrative: concise, neutral, official, suitable for university administration.";
  }
  if (tone === "Business-polite") {
    return "Business-polite: polite, professional, slightly warm, suitable for formal communication.";
  }
  if (tone === "Friendly-professional") {
    return "Friendly-professional: warm and collegial, but still professional.";
  }
  return "Casual: relaxed but still respectful. Use only when appropriate.";
}

function systemPromptBase(tone: Tone): string {
  return `
You are an email drafting assistant for a Japanese university department chair.

ROLE (STRICT):
- Sender is ALWAYS Hitoshi Eguchi.
- Write ONLY from Eguchi's perspective.
- Never write as the recipient or as another office.

GREETING / SIGNATURE (STRICT):
- Do NOT include any greeting line.
  The system will prepend it from the Step 3 recipient field.
- Do NOT include any signature lines or sender name.
  The system will attach the signature.

TONE:
${toneInstruction(tone)}

OUTPUT (STRICT):
- Return ONLY valid JSON: {"subject":"...","body":"..."}
- No markdown, no extra keys.

LANGUAGE:
- Japanese: Japanese subject and body
- English: English subject and body
- Bilingual: Japanese first, then exactly "\\n-----\\n", then English
`.trim();
}

function systemPromptHard(language: Language, tone: Tone): string {
  const base = systemPromptBase(tone);

  if (language === "English") {
    return `${base}

HARD ENGLISH REQUIREMENT:
- The entire subject and body MUST be English.
- Do NOT use Japanese characters in the body.`.trim();
  }

  if (language === "Japanese") {
    return `${base}

HARD JAPANESE REQUIREMENT:
- The entire subject and body MUST be Japanese.
- Do NOT use English sentences in the body.`.trim();
  }

  return `${base}

HARD BILINGUAL REQUIREMENT:
- Japanese first, then exactly "\\n-----\\n", then English.
- Japanese block MUST be Japanese.
- English block MUST be English.`.trim();
}

function classifyPurposeNote(note: string): "draft" | "instruction" {
  const t = note.trim();
  if (!t) return "instruction";

  const lines = t.split("\n").filter((l) => l.trim().length > 0);
  const hasSentenceEnd = /[。！？.!?]/.test(t);

  if ((lines.length >= 3 || t.length >= 80) && hasSentenceEnd) return "draft";
  return "instruction";
}

function userPrompt(args: {
  mode: Mode;
  intent: Intent;
  replyTarget: string;
  backgroundThread: string;
  purposeNote: string;
  language: Language;
  tone: Tone;
}): string {
  const { intent } = args;

  if (intent === "acknowledge") {
    return `
TASK:
Draft a short acknowledgment reply. Nothing more.

RULES:
- Write ONLY that you have received the message.
- Do NOT respond to specific content, questions, or requests.
- Do NOT confirm details, offer actions, or state next steps.
- One to three sentences maximum.

ORIGINAL MESSAGE (BACKGROUND ONLY):
${args.replyTarget}

${args.purposeNote ? `ADDITIONAL NOTE FROM SENDER:\n${args.purposeNote}` : ""}

SETTINGS:
- language: ${args.language}
- tone: ${args.tone}

REMINDERS:
- No greeting line. No signature. Output strict JSON only.
`.trim();
  }

  if (intent === "delay") {
    return `
TASK:
Draft a reply saying you have received the message and will respond properly later.

RULES:
- Acknowledge receipt.
- Say you will follow up later.
- Do NOT answer questions or make decisions yet.
- Keep it short.

ORIGINAL MESSAGE (BACKGROUND ONLY):
${args.replyTarget}

${args.purposeNote ? `ADDITIONAL NOTE FROM SENDER:\n${args.purposeNote}` : ""}

SETTINGS:
- language: ${args.language}
- tone: ${args.tone}

REMINDERS:
- No greeting line. No signature. Output strict JSON only.
`.trim();
  }

  if (intent === "question") {
    return `
TASK:
Draft a reply that asks a clarifying question instead of answering or agreeing.

RULES:
- Do NOT answer requests or confirm details from the original message.
- Do NOT make commitments.
- Ask one focused clarifying question, or ask for more information.

ORIGINAL MESSAGE:
${args.replyTarget}

${args.purposeNote ? `WHAT TO CLARIFY:\n${args.purposeNote}` : ""}

SETTINGS:
- language: ${args.language}
- tone: ${args.tone}

REMINDERS:
- No greeting line. No signature. Output strict JSON only.
`.trim();
  }

  if (intent === "full") {
    return `
TASK:
Draft a full email reply that addresses all main points in the original message.

ORIGINAL MESSAGE:
${args.replyTarget}

BACKGROUND CONTEXT:
${args.backgroundThread}

${args.purposeNote ? `SENDER'S INSTRUCTIONS / CONSTRAINTS:\n${args.purposeNote}` : ""}

SETTINGS:
- language: ${args.language}
- tone: ${args.tone}

REMINDERS:
- No greeting line. No signature. Output strict JSON only.
`.trim();
  }

  if (intent === "rewrite") {
    return `
TASK:
The sender has written a rough draft. Rewrite it as a polished professional email.

RULES:
- Preserve meaning, intended action, and decision exactly.
- Preserve factual content.
- Do NOT introduce new claims.
- Improve clarity, grammar, naturalness, and tone.

SENDER'S ROUGH DRAFT:
${args.purposeNote || args.replyTarget}

${args.backgroundThread ? `REFERENCE CONTEXT:\n${args.backgroundThread}` : ""}

SETTINGS:
- language: ${args.language}
- tone: ${args.tone}

REMINDERS:
- No greeting line. No signature. Output strict JSON only.
`.trim();
  }

  const noteType = classifyPurposeNote(args.purposeNote);

  if (args.mode === "scratch") {
    if (noteType === "draft") {
      return `
TASK:
Rewrite the user's rough draft as a polished professional email.

IMPORTANT:
- Preserve intended meaning, decision, and action exactly.
- Preserve factual content.
- Do NOT introduce new claims.
- Only improve clarity, grammar, naturalness, and tone.

USER'S ROUGH DRAFT:
${args.purposeNote}

REFERENCE TEXT:
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
Draft a new email.

GOAL / REQUEST:
${args.replyTarget}

REFERENCE TEXT:
${args.backgroundThread || "(none)"}

PURPOSE NOTE / INSTRUCTIONS:
${args.purposeNote || "(none)"}

SETTINGS:
- language: ${args.language}
- tone: ${args.tone}

REMINDERS:
- No greeting line. No signature. Output strict JSON only.
`.trim();
  }

  if (noteType === "draft") {
    return `
TASK:
Rewrite the user's rough draft reply as a polished professional reply.

IMPORTANT:
- Preserve intended meaning, decision, and action exactly.
- Preserve factual content.
- Do NOT introduce new claims.
- Ensure it is appropriate as a reply to the received message.

USER'S ROUGH DRAFT:
${args.purposeNote}

RECEIVED MESSAGE:
${args.replyTarget}

BACKGROUND CONTEXT:
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

PRIMARY INSTRUCTION:
${args.purposeNote || "(none)"}

This instruction represents the sender's communication decision.
Follow it exactly.

CRITICAL RULES:
- Do NOT automatically respond to all content in the original message.
- Do NOT expand into a full reply unless instructed.
- Do NOT confirm every point in the original message.
- Do NOT introduce actions or commitments not stated in the instruction.
- The original message is background context only.

ORIGINAL MESSAGE:
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

    const VALID_INTENTS: Intent[] = [
      "default",
      "full",
      "acknowledge",
      "delay",
      "question",
      "rewrite",
    ];

    const intent: Intent = VALID_INTENTS.includes(data.intent as Intent)
      ? (data.intent as Intent)
      : "default";

    const requestText = safeTrim(data.requestText ?? "", 50000);
    const purposeNote = safeTrim(data.purposeNote ?? "", 2000);

    const language: Language = data.language ?? "Japanese";
    const tone: Tone = data.tone ?? "Administrative";

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
            "Please write your goal or a rough draft in Step 2, or paste reference text in Step 1.",
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
      intent,
      replyTarget,
      backgroundThread: background,
      purposeNote,
      language,
      tone,
    });

    let out = await callModelOnce({
      client,
      model,
      systemPrompt: systemPromptBase(tone),
      userContent: uContent,
      temperature: 0.2,
    });

    if (!languageOutputOK(language, out.body)) {
      out = await callModelOnce({
        client,
        model,
        systemPrompt: systemPromptHard(language, tone),
        userContent: uContent,
        temperature: 0.0,
      });

      if (!languageOutputOK(language, out.body)) {
        return NextResponse.json(
          {
            error: "Model output did not match requested language/format.",
            detail:
              "Please try again. If this repeats, the language validation may need to be relaxed.",
          },
          { status: 500 }
        );
      }
    }

    const subject = safeTrim(out.subject, 300);
    const body = safeTrim(out.body, 20000);

    const bodyWithSalutation = prependSalutation({
      body,
      language,
      toJp,
      toEn,
    });

    const finalBody = attachSignatureByLanguage({
      body: bodyWithSalutation,
      language,
    });

    return NextResponse.json({ subject, body: finalBody });
  } catch (e: any) {
    console.error("Draft API error:", e);
    return NextResponse.json(
      { error: "Server error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}