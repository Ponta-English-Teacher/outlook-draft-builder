"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type DraftOut = { subject: string; body: string };
type Mode = "reply" | "scratch";
type Intent = "default" | "full" | "acknowledge" | "delay" | "question" | "rewrite";

const INTENT_OPTIONS: { value: Intent; label: string; hint: string }[] = [
  { value: "default",     label: "Default",         hint: "Let Step 2 guide the output" },
  { value: "full",        label: "Full reply",       hint: "Respond to all points" },
  { value: "acknowledge", label: "Acknowledge only", hint: "Short acknowledgment only" },
  { value: "delay",       label: "Reply later",      hint: "Acknowledge, follow up later" },
  { value: "question",    label: "Ask a question",   hint: "Ask for clarification" },
  { value: "rewrite",     label: "Rewrite my draft", hint: "Polish Step 2 as a draft" },
];

// Small pill-style toggle used in the compact control bar
function Pill({
  active,
  onClick,
  children,
  activeColor = "border-sky-500",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  activeColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-lg border text-sm font-medium transition whitespace-nowrap",
        active
          ? `${activeColor} bg-slate-800 text-slate-100`
          : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200 hover:border-slate-600",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// Collapsible section with summary badge when closed
function Collapsible({
  title,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-900 hover:bg-slate-800 transition text-left gap-4"
      >
        <span className="font-medium text-slate-200 text-sm">{title}</span>
        <span className="flex items-center gap-3 shrink-0">
          {!open && badge ? (
            <span className="text-xs text-slate-500 truncate max-w-[180px]">{badge}</span>
          ) : null}
          <span className="text-slate-500 text-xs">{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && <div className="px-4 py-4 bg-slate-950">{children}</div>}
    </div>
  );
}

export default function WorkspacePage() {
  const [mode, setMode] = useState<Mode>("reply");
  const [intent, setIntent] = useState<Intent>("default");

  const [requestText, setRequestText] = useState("");
  const [purposeNote, setPurposeNote] = useState("");
  const [showStep2Examples, setShowStep2Examples] = useState(false);

  const [language, setLanguage] = useState<"Japanese" | "English" | "Bilingual">("Japanese");
  const [tone, setTone] = useState<"Polite" | "Neutral" | "Administrative">("Administrative");

  const [toField, setToField] = useState("");
  const [ccField, setCcField] = useState("");

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guidanceText = useMemo(() => {
    if (mode === "reply") return "Uses Step 1 + Step 2 to draft subject/body.";
    return "Uses Step 2 (+ settings) to draft. Step 1 is optional.";
  }, [mode]);

  async function generateDraft() {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode, intent, requestText, purposeNote, language, tone, to: toField,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data?.error || "Draft generation failed."); return; }
      const out = data as DraftOut;
      setSubject(out.subject || "");
      setBody(out.body || "");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function refineDraft() {
    if (!subject || !body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, language, tone, to: toField, purposeNote }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data?.error || "Refinement failed."); return; }
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
      body: JSON.stringify({ to: toField, cc: ccField, subject, body }),
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
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 max-w-4xl mx-auto space-y-4">

      {/* Header */}
      <header className="flex items-center gap-4 pb-3 border-b border-slate-800">
        <h1 className="text-xl font-semibold">Workspace</h1>
        <span className="text-slate-600 text-sm">Draft only — never sends</span>
        <Link href="/" className="underline text-slate-500 text-sm ml-auto">← Home</Link>
      </header>

      {/* ── Combined control bar ── */}
      <section className="space-y-3 p-4 bg-slate-900 rounded-xl border border-slate-800">

        {/* Mode */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 w-24 shrink-0">Mode</span>
          <Pill active={mode === "reply"} onClick={() => setMode("reply")}>
            Reply to received
          </Pill>
          <Pill active={mode === "scratch"} onClick={() => setMode("scratch")}>
            From scratch
          </Pill>
        </div>

        {/* Message Type */}
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-xs text-slate-500 w-24 shrink-0 pt-1.5">Message type</span>
          <div className="flex flex-wrap gap-2">
            {INTENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setIntent(opt.value)}
                title={opt.hint}
                className={[
                  "px-3 py-1.5 rounded-lg border text-sm font-medium transition whitespace-nowrap",
                  intent === opt.value
                    ? "border-amber-500 bg-slate-800 text-slate-100"
                    : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200 hover:border-slate-600",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 w-24 shrink-0">Language</span>
          {(["Japanese", "English", "Bilingual"] as const).map((l) => (
            <Pill key={l} active={language === l} onClick={() => setLanguage(l)}>
              {l === "Bilingual" ? "Bilingual (JP→EN)" : l}
            </Pill>
          ))}
        </div>

        {/* Tone */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 w-24 shrink-0">Tone</span>
          {(["Administrative", "Polite", "Neutral"] as const).map((t) => (
            <Pill key={t} active={tone === t} onClick={() => setTone(t)}>
              {t}
            </Pill>
          ))}
        </div>

      </section>

      {/* ── Step 1 — collapsible ── */}
      <Collapsible
        title={`Step 1 — ${mode === "reply" ? "Paste received message" : "Source material (optional)"}`}
        defaultOpen={true}
        badge={
          requestText
            ? requestText.slice(0, 60) + (requestText.length > 60 ? "…" : "")
            : "(empty)"
        }
      >
        {mode === "scratch" && (
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={() => setRequestText("")}
              className="text-xs underline text-slate-500 hover:text-slate-300"
            >
              Clear
            </button>
          </div>
        )}
        <textarea
          className="w-full min-h-[200px] rounded-lg bg-slate-900 border border-slate-700 p-3 text-sm"
          placeholder={
            mode === "reply"
              ? "Paste the original request here…"
              : "Optional: paste reference text (or leave blank)…"
          }
          value={requestText}
          onChange={(e) => setRequestText(e.target.value)}
        />
      </Collapsible>

      {/* ── Step 2 — collapsible ── */}
      <Collapsible
        title="Step 2 — Purpose / Your draft / Instructions (optional)"
        defaultOpen={true}
        badge={
          purposeNote
            ? purposeNote.slice(0, 60) + (purposeNote.length > 60 ? "…" : "")
            : "(empty)"
        }
      >
        <p className="text-slate-400 text-sm mb-2">
          Write your purpose, a rough draft, or specific instructions.{" "}
          <button
            type="button"
            onClick={() => setShowStep2Examples((v) => !v)}
            className="underline text-slate-500 hover:text-slate-300"
          >
            {showStep2Examples ? "Hide examples" : "Show examples"}
          </button>
        </p>
        {showStep2Examples && (
          <ul className="text-slate-500 text-xs list-disc list-inside mb-3 space-y-1">
            <li>Requesting cooperation politely</li>
            <li>Asking questions first, not deciding yet</li>
            <li>Do not commit to a date yet — keep it short</li>
            <li>(or paste your own rough draft here)</li>
          </ul>
        )}
        <textarea
          className="w-full min-h-[120px] rounded-lg bg-slate-900 border border-slate-700 p-3 text-sm"
          placeholder="Purpose, instructions, or rough draft…"
          value={purposeNote}
          onChange={(e) => setPurposeNote(e.target.value)}
        />
      </Collapsible>

      {/* ── Recipients — collapsible, closed by default ── */}
      <Collapsible
        title="Recipients"
        defaultOpen={false}
        badge={toField || "not set"}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-slate-400 text-xs mb-1">To</label>
            <input
              className="w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-sm"
              placeholder="e.g. 今枝さん/Ms. Imaeda"
              value={toField}
              onChange={(e) => setToField(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Cc (optional)</label>
            <input
              className="w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-sm"
              placeholder="e.g. Educational Support Office"
              value={ccField}
              onChange={(e) => setCcField(e.target.value)}
            />
          </div>
        </div>
      </Collapsible>

      {/* ── Generate ── */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={generateDraft}
          disabled={busy}
          className="px-5 py-2.5 rounded-lg bg-sky-600 text-black font-semibold disabled:opacity-60 text-sm"
        >
          {busy ? "Working…" : "Generate Draft"}
        </button>
        {error
          ? <span className="text-red-300 text-sm">{error}</span>
          : <span className="text-slate-500 text-sm">{guidanceText}</span>
        }
      </div>

      {/* ── Draft preview ── */}
      <section className="space-y-2">
        <div className="flex items-baseline gap-2">
          <h2 className="font-semibold text-slate-200">Draft preview</h2>
          <span className="text-slate-600 text-xs">Edit here, then refine or export</span>
        </div>

        <input
          className="w-full rounded-lg bg-slate-900 border border-slate-700 p-2.5 text-sm"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <textarea
          className="w-full min-h-[320px] rounded-lg bg-slate-900 border border-slate-700 p-3 text-sm"
          placeholder="Email body appears here…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        {/* Refine + Export row */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800">
          <button
            onClick={refineDraft}
            disabled={!subject || !body || busy}
            className="px-5 py-2.5 rounded-lg bg-violet-600 text-white font-semibold disabled:opacity-50 text-sm"
            title={!subject || !body ? "Generate a draft first" : "Polish without changing meaning"}
          >
            {busy ? "Working…" : "Refine Edited Draft"}
          </button>
          <button
            onClick={exportOutlookDraft}
            disabled={!subject || !body || busy}
            className="px-5 py-2.5 rounded-lg bg-emerald-600 text-black font-semibold disabled:opacity-50 text-sm"
            title={!subject || !body ? "Generate a draft first" : "Download draft.eml"}
          >
            Export Outlook Draft
          </button>
          <span className="text-slate-600 text-xs ml-auto">
            Refine preserves meaning · Export opens in Outlook
          </span>
        </div>
      </section>

    </main>
  );
}
