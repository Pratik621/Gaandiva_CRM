import { NextResponse } from "next/server";
import { authorizeMarketing } from "@/lib/marketing/meta-auth";
import { checkMetaToken } from "@/lib/marketing/meta-token-check";
import {
  syncAndRecordMetaSource,
  META_SOURCE_COLUMNS,
  type MetaSource,
} from "@/lib/marketing/meta-lead-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PUBLIC_COLUMNS =
  "id, label, page_id, page_name, dataset_id, status, last_synced_at, last_sync_status, last_sync_error, last_sync_leads, last_sync_duplicates, last_sync_forms, last_sync_errors, discovered_forms, created_at";

function withMaskedToken<T extends { access_token?: string }>(row: T) {
  const { access_token, ...rest } = row;
  return { ...rest, token_hint: access_token ? `••••${access_token.slice(-4)}` : null };
}

export async function GET() {
  try {
    const auth = await authorizeMarketing();
    if (!auth.ok) return auth.response;

    const { data, error } = await auth.admin
      .from("simplified_meta_sources")
      .select(`${PUBLIC_COLUMNS}, access_token`)
      .eq("organization_id", auth.orgId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      metaSources: ((data ?? []) as { access_token: string }[]).map(withMaskedToken),
    });
  } catch (err) {
    console.error("List Meta sources error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Connects a Meta token: checks with Meta what it can do (read leads from a
 * Page, and/or send to the Conversions API dataset), stores it, and — when it
 * can read leads — runs the first lead sync right away. The check is returned
 * so the UI can show exactly what works and what's missing.
 */
export async function POST(request: Request) {
  try {
    const auth = await authorizeMarketing();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    // Tokens are long and often pasted with junk around/inside them (line
    // breaks, quotes, "Bearer ", "access_token=") — any of which Meta reports
    // as "Bad signature". A real token never contains whitespace or quotes.
    const accessToken =
      typeof body.access_token === "string"
        ? body.access_token
            .replace(/\s+/g, "")
            .replace(/["'`]/g, "")
            .replace(/^(Bearer|access_token=)/i, "")
        : "";
    const pageIdInput = typeof body.page_id === "string" ? body.page_id.trim() : "";
    const datasetId = typeof body.dataset_id === "string" ? body.dataset_id.trim() : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";

    if (!accessToken) {
      return NextResponse.json({ error: "Access token is required" }, { status: 400 });
    }
    if ((pageIdInput && !/^\d+$/.test(pageIdInput)) || (datasetId && !/^\d+$/.test(datasetId))) {
      return NextResponse.json({ error: "Page ID and Dataset ID must be numeric" }, { status: 400 });
    }

    const check = await checkMetaToken(accessToken, pageIdInput || null, datasetId || null);

    if (!check.tokenValid) {
      return NextResponse.json(
        {
          error: `Meta rejected this token: ${check.error}. Re-copy the full token (starts with "EAA") and check it at developers.facebook.com/tools/debug/accesstoken`,
          check,
        },
        { status: 400 }
      );
    }

    if (!check.canReadLeads && !datasetId) {
      const missing = check.missingLeadPermissions.length
        ? ` Missing permissions: ${check.missingLeadPermissions.join(", ")}.`
        : "";
      return NextResponse.json(
        {
          error: `This token can't read leads (${check.leadsError}).${missing} Use a Page / System User token with lead access, or add a Dataset ID to use this token for status updates only.`,
          check,
        },
        { status: 400 }
      );
    }

    // A token that reaches a Page's leads is stored against that Page and
    // synced; one that can't (e.g. an Events Manager Conversions API token)
    // is stored status-only (page_id NULL) and used just to push statuses.
    const pageId = check.canReadLeads && check.page ? check.page.id : null;
    const values = {
      organization_id: auth.orgId,
      access_token: accessToken,
      page_id: pageId,
      page_name: pageId ? check.page?.name ?? null : null,
      dataset_id: datasetId || null,
      label: label || null,
      status: "active",
      added_by: auth.userId,
    };

    let existingQuery = auth.admin
      .from("simplified_meta_sources")
      .select("id")
      .eq("organization_id", auth.orgId);
    existingQuery = pageId
      ? existingQuery.eq("page_id", pageId)
      : existingQuery.is("page_id", null).eq("dataset_id", datasetId);
    const { data: existingRaw } = await existingQuery.limit(1).maybeSingle();
    const existingId = (existingRaw as { id: string } | null)?.id;

    const { data: saved, error } = existingId
      ? await auth.admin
          .from("simplified_meta_sources")
          .update(values as never)
          .eq("id", existingId)
          .select(META_SOURCE_COLUMNS)
          .single()
      : await auth.admin
          .from("simplified_meta_sources")
          .insert(values as never)
          .select(META_SOURCE_COLUMNS)
          .single();

    if (error || !saved) {
      return NextResponse.json({ error: error?.message || "Could not save Meta source" }, { status: 500 });
    }

    const sync = pageId ? await syncAndRecordMetaSource(auth.admin, saved as MetaSource) : null;

    return NextResponse.json({
      ok: true,
      mode: pageId ? "leads" : "status_only",
      check,
      sync: sync && {
        ok: sync.ok,
        imported: sync.leadsInserted,
        skipped_duplicates: sync.skippedDuplicates,
        linked_existing: sync.linkedExisting,
        forms_processed: sync.formsProcessed,
        errors: sync.errors,
        error: sync.error ?? null,
        forms: sync.forms,
      },
    });
  } catch (err) {
    console.error("Connect Meta source error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
