import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { syncAdSource } from "@/lib/marketing/sheet-sync";
import {
  syncAndRecordMetaSource,
  META_SOURCE_COLUMNS,
  type MetaSource,
} from "@/lib/marketing/meta-lead-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
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
    if (
      !roleNames.includes("sm_marketing") &&
      !roleNames.includes("sm_agent") &&
      !roleNames.includes("admin")
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: sourcesRaw, error: sourcesError } = await admin
      .from("simplified_ad_sources")
      .select("id, organization_id, sheet_url, label")
      .eq("organization_id", orgId)
      .eq("status", "active");

    if (sourcesError) {
      return NextResponse.json({ error: sourcesError.message }, { status: 500 });
    }

    const sources = (sourcesRaw ?? []) as {
      id: string;
      organization_id: string;
      sheet_url: string;
      label: string | null;
    }[];

    const results = [];
    for (const source of sources) {
      const result = await syncAdSource(admin, source);

      await admin
        .from("simplified_ad_sources")
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_status: result.ok ? "success" : "error",
          last_sync_error: result.error ?? null,
          last_sync_rows: result.rowsRead,
        } as never)
        .eq("id", source.id);

      results.push({ id: source.id, ...result });
    }

    // Meta Lead Ads tokens connected for this org — same Refresh button.
    const { data: metaSourcesRaw } = await admin
      .from("simplified_meta_sources")
      .select(META_SOURCE_COLUMNS)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .not("page_id", "is", null);

    const meta = { imported: 0, skipped_duplicates: 0, forms_processed: 0, errors: 0 };
    for (const metaSource of (metaSourcesRaw ?? []) as MetaSource[]) {
      const result = await syncAndRecordMetaSource(admin, metaSource);
      results.push({ id: metaSource.id, source: "meta", ...result });
      meta.imported += result.leadsInserted;
      meta.skipped_duplicates += result.skippedDuplicates;
      meta.forms_processed += result.formsProcessed;
      meta.errors += result.errors;
    }

    return NextResponse.json({ ok: true, synced: results.length, results, meta });
  } catch (err) {
    console.error("Manual ad-source sync error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
