import { NextResponse } from "next/server";

/** @deprecated Use GET /api/chat/thread?campaignId= for client-level chat. */
export async function GET() {
  return NextResponse.json(
    {
      error:
        "Lead conversations are no longer supported. Use GET /api/chat/thread?campaignId= for client chat.",
    },
    { status: 410 }
  );
}
