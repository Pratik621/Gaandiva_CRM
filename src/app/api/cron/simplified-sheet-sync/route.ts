import { NextResponse } from "next/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { syncAdSource } from "@/lib/marketing/sheet-sync";
import {
  syncAndRecordMetaSource,
  META_SOURCE_COLUMNS,
  type MetaSource,
} from "@/lib/marketing/meta-lead-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Allow in non-production for local testing without secret
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const header = request.headers.get("x-cron-secret");
  return header === secret;
}

async function runSync() {
  const admin = getAdminClientSafe();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: sources, error } = await admin
    .from("simplified_ad_sources")
    .select("id, organization_id, sheet_url, label")
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];
  for (const source of sources ?? []) {
    const typedSource = source as {
      id: string;
      organization_id: string;
      sheet_url: string;
      label: string | null;
    };

    const result = await syncAdSource(admin, typedSource);

    await admin
      .from("simplified_ad_sources")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: result.ok ? "success" : "error",
        last_sync_error: result.error ?? null,
        last_sync_rows: result.rowsRead,
      } as never)
      .eq("id", typedSource.id);

    results.push({ id: typedSource.id, ...result });
  }

  const { data: metaSources, error: metaError } = await admin
    .from("simplified_meta_sources")
    .select(META_SOURCE_COLUMNS)
    .eq("status", "active")
    .not("page_id", "is", null);

  if (metaError) {
    console.error("[cron/simplified-sheet-sync] Meta sources query failed:", metaError.message);
  }

  for (const metaSource of (metaSources ?? []) as MetaSource[]) {
    const result = await syncAndRecordMetaSource(admin, metaSource);
    results.push({ id: metaSource.id, source: "meta", ...result });
  }

  return NextResponse.json({ ok: true, synced: results.length, results });
}

export async function GET(request: Request) {
  try {
    if (!authorizeCron(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return await runSync();
  } catch (err) {
    console.error("[cron/simplified-sheet-sync] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
