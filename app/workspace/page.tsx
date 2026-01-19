import Link from "next/link";

export default function WorkspacePage() {
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

      {/* Step 1: Request Intake */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">
          Step 1 — Paste the request you received
        </h2>

        <p className="text-slate-300">
          Paste an email, forwarded message, PDF text, Word text, or rough notes.
        </p>

        <textarea
          className="w-full min-h-[260px] rounded-lg bg-slate-900 border border-slate-700 p-4 text-base"
          placeholder="Paste the original request here..."
        />
      </section>

      {/* Step 2: Purpose / Intention */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">
          Step 2 — Purpose of this email (optional)
        </h2>

        <p className="text-slate-300">
          Write in your own words what you are trying to do.  
          This guides tone and structure.
        </p>

        <textarea
          className="w-full min-h-[160px] rounded-lg bg-slate-900 border border-slate-700 p-4 text-base"
          placeholder={`Examples:
- Requesting cooperation
- Asking questions first, not deciding yet
- Confirming details politely
- Administrative request with a soft tone`}
        />
      </section>

      {/* Step 3: Recipients */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">
          Step 3 — Recipients
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-slate-300 mb-1">To</label>
            <input
              className="w-full rounded-lg bg-slate-900 border border-slate-700 p-3"
              placeholder="e.g. Prof. ○○ / English Department Faculty"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Cc (optional)</label>
            <input
              className="w-full rounded-lg bg-slate-900 border border-slate-700 p-3"
              placeholder="e.g. Educational Support Office"
            />
          </div>
        </div>

        <p className="text-slate-400">
          (Later this will connect to the editable directory.)
        </p>
      </section>

      {/* Step 4: ChatGPT discussion */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">
          Step 4 — Discussion with ChatGPT
        </h2>

        <div className="rounded-lg border border-slate-700 bg-slate-900 p-6 space-y-6">
          
          {/* Example conversation */}
          <div className="space-y-2">
            <p className="text-sm text-slate-400">You</p>
            <div className="rounded-md bg-slate-800 p-4">
              Please draft a polite administrative email in Japanese.
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-slate-400">ChatGPT</p>
            <div className="rounded-md bg-slate-800 p-4">
              （ここに最初のドラフトが表示されます）
            </div>
          </div>

          {/* Input */}
          <div className="space-y-2">
            <label className="block text-slate-300">
              Your instruction to ChatGPT
            </label>
            <textarea
              className="w-full min-h-[120px] rounded-lg bg-slate-800 border border-slate-700 p-4"
              placeholder="e.g. Make it shorter, softer, emphasize deadline, bilingual..."
            />
          </div>
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
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Body</label>
            <textarea
              className="w-full min-h-[300px] rounded-lg bg-slate-900 border border-slate-700 p-4"
              placeholder="Final email body appears here..."
            />
          </div>
        </div>
      </section>

      {/* Export */}
      <section className="border-t border-slate-800 pt-10 flex items-center justify-between">
        <p className="text-slate-400">
          Export creates an Outlook draft file.  
          You will open it in Outlook and send manually.
        </p>

        <button className="px-6 py-3 rounded-lg bg-emerald-600 text-black font-semibold">
          Export Outlook Draft File
        </button>
      </section>

    </main>
  );
}
