import Link from "next/link";

export default function DirectoryPage() {
  return (
    <main className="min-h-screen p-10">
      <h1 className="text-3xl font-semibold">Directory</h1>
      <p className="mt-4 text-lg">
        Faculty, offices, groups (editable).
      </p>

      <div className="mt-8">
        <Link className="underline" href="/">Back to Home</Link>
      </div>
    </main>
  );
}
