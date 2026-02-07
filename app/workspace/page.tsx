"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type DraftOut = { subject: string; body: string };
type Mode = "reply" | "scratch";

export default function WorkspacePage() {
  // NEW: mode selector
  const [mode, setMode] = useState<Mode>("reply");

  const [requestText, setRequestText] = useState("");
  const [purposeNote, setPurposeNote] = useState("");

  const [language, setLanguage] = useState<"Japanese" | "English" | "Bilingual">(
    "Japanese"
  );

  const [tone, setTone] = useState<"Polite" | "Neutral" | "Administrative">(
    "Administrative"
  );

  const [toField, setToField] = useState("");
  const [ccField, setCcField] = useState("");

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guidanceText = useMemo(() => {
    if (mode === "reply") {
      return "Uses Step 1 + Step 2 to draft subject/body.";
    }
    return "Uses Step 2 (+ recipients / settings) to draft subject/body. Step 1 is optional in From-scratch mode.";
  }, [mode]);

  const scratchTip = useMemo(() => {
    if (mode !== "scratch") return null;
    const hasAnyInput = (purposeNote || "").trim().length > 0 || (requestText || "").trim().length > 0;
    if (hasAnyInput) return null;
    return "Tip: In From-scratch mode, write your goal in Step 2 (even 1–2 lines is enough).";
  }, [mode, purposeNote, requestText]);

  async function generateDraft() {
    setBusy(true);
    setError(null);

    try {
      const resp = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // NEW: tell the API which mode the user is in (safe even if API ignores it)
          mode,
          requestText,
          purposeNote,
          language,
          tone,
          to: toField, // ✅ important (Step 3 To)
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setError(data?.error || "Draft generation failed.");
        return;
      }

      const out = data as DraftOut;
      setSubject(out.subject || "");
      setBody(out.body || "");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function exportOutlookDraft() {
    if (!subject || !body || busy) return;

    const resp = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: toField,
        cc: ccField,
        subject,
        body,
      }),
    });

    if (!resp.ok) return;

    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "draft.eml";
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-10 space-y-16">
      {/* Header */}
      <header className="space-y-4">
        <h1 className="text-4xl font-semibold">Workspace</h1>
        <p className="text-lg text-slate-300">
          Draft creation only. This app never sends email.
        </p>
        <Link href="/" className="underline text-slate-400">
          ← Back to Home
        </Link>
      </header>

      {/* NEW: Mode selector */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Mode</h2>
        <p className="text-slate-300">
          Choose how you want to create a message.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("reply")}
            className={[
              "rounded-xl border p-5 text-left transition",
              mode === "reply"
                ? "border-sky-500 bg-slate-900"
                : "border-slate-800 bg-slate-950 hover:bg-slate-900",
            ].join(" ")}
          >
            <div className="text-lg font-semibold">Reply to received material</div>
            <div className="text-slate-400 mt-1">
              Use email text / notes (and later file uploads) as the source.
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode("scratch")}
            className={[
              "rounded-xl border p-5 text-left transition",
              mode === "scratch"
                ? "border-sky-500 bg-slate-900"
                : "border-slate-800 bg-slate-950 hover:bg-slate-900",
            ].join(" ")}
          >
            <div className="text-lg font-semibold">Create from scratch</div>
            <div className="text-slate-400 mt-1">
              No incoming message required. Describe your goal in Step 2.
            </div>
          </button>
        </div>

        {scratchTip ? <div className="text-slate-400">{scratchTip}</div> : null}
      </section>

      {/* Step 1: Request Intake (now optional in From-scratch mode) */}
      <section className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold">
            Step 1 — {mode === "reply" ? "Paste the request you received" : "Source material (optional)"}
          </h2>

          {mode === "scratch" ? (
            <button
              type="button"
              onClick={() => setRequestText("")}
              className="text-sm underline text-slate-400"
              title="Clear Step 1 text"
            >
              Clear
            </button>
          ) : null}
        </div>

        <p className="text-slate-300">
          {mode === "reply"
            ? "Paste an email, forwarded message, PDF text, Word text, or rough notes."
            : "If you have any reference text (old email, policy note, previous message), paste it here. Otherwise you can skip Step 1 and write your intent in Step 2."}
        </p>

        <textarea
          className="w-full min-h-[260px] rounded-lg bg-slate-900 border border-slate-700 p-4 text-base"
          placeholder={
            mode === "reply"
              ? "Paste the original request here..."
              : "Optional: paste any reference text here (or leave blank)..."
          }
          value={requestText}
          onChange={(e) => setRequestText(e.target.value)}
        />
      </section>

      {/* Step 2: Purpose / Intention */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">
          Step 2 — Purpose of this email (optional)
        </h2>

        <p className="text-slate-300">
          Write in your own words what you are trying to do. This guides tone and
          structure.
        </p>

        <textarea
          className="w-full min-h-[160px] rounded-lg bg-slate-900 border border-slate-700 p-4 text-base"
          placeholder={`Examples:
- Requesting cooperation
- Asking questions first, not deciding yet
- Confirming details politely
- Administrative request with a soft tone`}
          value={purposeNote}
          onChange={(e) => setPurposeNote(e.target.value)}
        />
      </section>

      {/* Language & Tone */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Language & Tone</h2>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-slate-300 text-lg">Language</label>

            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 text-lg">
                <input
                  type="radio"
                  name="language"
                  value="Japanese"
                  checked={language === "Japanese"}
                  onChange={() => setLanguage("Japanese")}
                />
                Japanese
              </label>

              <label className="flex items-center gap-3 text-lg">
                <input
                  type="radio"
                  name="language"
                  value="English"
                  checked={language === "English"}
                  onChange={() => setLanguage("English")}
                />
                English
              </label>

              <label className="flex items-center gap-3 text-lg">
                <input
                  type="radio"
                  name="language"
                  value="Bilingual"
                  checked={language === "Bilingual"}
                  onChange={() => setLanguage("Bilingual")}
                />
                Bilingual (JP → EN)
              </label>
            </div>

            <p className="text-slate-400">
              Bilingual outputs Japanese first, then English with a divider.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-slate-300 text-lg">Tone</label>

            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 text-lg">
                <input
                  type="radio"
                  name="tone"
                  value="Administrative"
                  checked={tone === "Administrative"}
                  onChange={() => setTone("Administrative")}
                />
                Administrative
              </label>

              <label className="flex items-center gap-3 text-lg">
                <input
                  type="radio"
                  name="tone"
                  value="Polite"
                  checked={tone === "Polite"}
                  onChange={() => setTone("Polite")}
                />
                Polite
              </label>

              <label className="flex items-center gap-3 text-lg">
                <input
                  type="radio"
                  name="tone"
                  value="Neutral"
                  checked={tone === "Neutral"}
                  onChange={() => setTone("Neutral")}
                />
                Neutral
              </label>
            </div>

            <p className="text-slate-400">
              Administrative is best for internal university emails.
            </p>
          </div>
        </div>
      </section>

      {/* Step 3: Recipients */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Step 3 — Recipients</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-slate-300 mb-1">To</label>
            <input
              className="w-full rounded-lg bg-slate-900 border border-slate-700 p-3"
              placeholder='e.g. 今枝さん/Ms. Imaeda'
              value={toField}
              onChange={(e) => setToField(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Cc (optional)</label>
            <input
              className="w-full rounded-lg bg-slate-900 border border-slate-700 p-3"
              placeholder="e.g. Educational Support Office"
              value={ccField}
              onChange={(e) => setCcField(e.target.value)}
            />
          </div>
        </div>

        <p className="text-slate-400">(Directory connection will be added later.)</p>
      </section>

      {/* Step 4: Generate Draft */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Step 4 — Generate / Revise Draft</h2>

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={generateDraft}
            disabled={busy}
            className="px-6 py-3 rounded-lg bg-sky-600 text-black font-semibold disabled:opacity-60"
          >
            {busy ? "Generating..." : "Generate Draft with ChatGPT"}
          </button>

          {error ? (
            <div className="text-red-300">{error}</div>
          ) : (
            <div className="text-slate-400">{guidanceText}</div>
          )}
        </div>
      </section>

      {/* Step 5: Draft Preview */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">
          Step 5 — Draft preview (what will be exported)
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-slate-300 mb-1">Subject</label>
            <input
              className="w-full rounded-lg bg-slate-900 border border-slate-700 p-3"
              placeholder="Email subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Body</label>
            <textarea
              className="w-full min-h-[300px] rounded-lg bg-slate-900 border border-slate-700 p-4"
              placeholder="Final email body appears here..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Export */}
      <section className="border-t border-slate-800 pt-10 flex items-center justify-between">
        <p className="text-slate-400">
          Export creates an Outlook draft file. You will open it in Outlook and send
          manually.
        </p>

        <button
          onClick={exportOutlookDraft}
          disabled={!subject || !body || busy}
          className="px-6 py-3 rounded-lg bg-emerald-600 text-black font-semibold disabled:opacity-50"
          title={!subject || !body ? "Generate a draft first" : "Download draft.eml"}
        >
          Export Outlook Draft File
        </button>
      </section>
    </main>
  );
}