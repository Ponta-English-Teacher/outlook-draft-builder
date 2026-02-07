import { NextResponse } from "next/server";

type ExportRequest = {
  to?: string;
  cc?: string;
  subject: string;
  body: string;
};

export async function POST(req: Request) {
  try {
    const data = (await req.json()) as ExportRequest;

    const subject = (data.subject || "").trim();
    const body = (data.body || "").trim();

    if (!subject || !body) {
      return NextResponse.json(
        { error: "Subject and body are required." },
        { status: 400 }
      );
    }

    const to = data.to ? `To: ${data.to}\n` : "";
    const cc = data.cc ? `Cc: ${data.cc}\n` : "";

    const eml = [
      to,
      cc,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      body,
    ].join("\n");

    return new NextResponse(eml, {
      headers: {
        "Content-Type": "message/rfc822",
        "Content-Disposition": 'attachment; filename="draft.eml"',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Export failed", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
