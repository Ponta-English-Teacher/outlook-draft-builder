import Link from "next/link";

export default function HistoryPage() {
  return (
    <main className="min-h-screen p-10">
      <h1 className="text-3xl font-semibold">History</h1>
      <p className="mt-4 text-lg">
        Past draft sessions (open / reuse).
      </p>

      <div className="mt-8">
        <Link className="underline" href="/">Back to Home</Link>
      </div>
    </main>
  );
}
