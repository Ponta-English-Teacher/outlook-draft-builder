import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen p-10">
      <h1 className="text-3xl font-semibold">Outlook Draft Builder</h1>

      <p className="mt-4 text-lg">
        Draft creation only. No sending. No mail passwords.
      </p>

      <ul className="mt-8 list-disc pl-6 text-lg">
        <li className="mt-2">
          <Link className="underline" href="/workspace">Workspace</Link>
        </li>
        <li className="mt-2">
          <Link className="underline" href="/directory">Directory</Link>
        </li>
        <li className="mt-2">
          <Link className="underline" href="/history">History</Link>
        </li>
      </ul>
    </main>
  );
}
