import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCallLogsClientSafe, CALL_LOGS_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/call-logs";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { CDR_IMPORT_BATCH_SIZE, isEmptyCdrRow, normalizeCdrRow } from "@/lib/cdr";

export const dynamic = "force-dynamic";

/**
 * POST { rows: object[] (<= 500, keyed by cdr_records column), batchId?: uuid }
 * The client splits large files (10k+ rows) into batches and calls this per batch.
 * Duplicate rows (same agent + uniqueid + sequence) are skipped.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const roleNames = await fetchUserRoleNames(supabase, user.id);
    if (!roleNames.includes("agent")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const db = getCallLogsClientSafe();
    if (!db) {
      return NextResponse.json({ error: CALL_LOGS_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const body = (await request.json().catch(() => null)) as { rows?: unknown; batchId?: unknown } | null;
    const rawRows = Array.isArray(body?.rows) ? (body!.rows as Record<string, unknown>[]) : [];
    if (rawRows.length === 0) {
      return NextResponse.json({ error: "No rows to import" }, { status: 400 });
    }
    if (rawRows.length > CDR_IMPORT_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum ${CDR_IMPORT_BATCH_SIZE} rows per request` },
        { status: 400 }
      );
    }
    const batchId =
      typeof body?.batchId === "string" && /^[0-9a-f-]{36}$/i.test(body.batchId) ? body.batchId : null;

    const rows = rawRows
      .filter((r) => r && typeof r === "object")
      .map((r) => normalizeCdrRow(r))
      .filter((r) => !isEmptyCdrRow(r))
      .map((r) => ({ ...r, agent_id: user.id, import_batch_id: batchId }));
    const skippedEmpty = rawRows.length - rows.length;

    if (rows.length === 0) {
      return NextResponse.json({ received: rawRows.length, inserted: 0, duplicates: 0, skipped_empty: skippedEmpty });
    }

    const { data, error } = await db
      .from("cdr_records")
      .upsert(rows, { onConflict: "agent_id,uniqueid,sequence", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("CDR import error:", error);
      const missingTable = /cdr_records/i.test(error.message ?? "") && /(exist|schema cache)/i.test(error.message ?? "");
      return NextResponse.json(
        {
          error: missingTable
            ? "Run supabase-call-logs/migrations/20260930000000_cdr_records.sql first"
            : error.message || "Failed to import call logs",
        },
        { status: 500 }
      );
    }

    const inserted = (data ?? []).length;
    return NextResponse.json({
      received: rawRows.length,
      inserted,
      duplicates: rows.length - inserted,
      skipped_empty: skippedEmpty,
    });
  } catch (err) {
    console.error("CDR import error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
