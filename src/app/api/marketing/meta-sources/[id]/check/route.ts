import { NextResponse } from "next/server";
import { authorizeMarketing } from "@/lib/marketing/meta-auth";
import { checkMetaToken } from "@/lib/marketing/meta-token-check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Re-checks a saved token with Meta (validity, lead access, dataset access). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authorizeMarketing();
    if (!auth.ok) return auth.response;

    const { data: sourceRaw, error } = await auth.admin
      .from("simplified_meta_sources")
      .select("access_token, page_id, dataset_id")
      .eq("id", id)
      .eq("organization_id", auth.orgId)
      .maybeSingle();

    const source = sourceRaw as { access_token: string; page_id: string | null; dataset_id: string | null } | null;
    if (error || !source) {
      return NextResponse.json({ error: error?.message || "Meta connection not found" }, { status: 404 });
    }

    const check = await checkMetaToken(source.access_token, source.page_id, source.dataset_id);

    // Store the Page Meta verified: corrects a saved ID that isn't a reachable
    // Page, and turns a status-only connection into a lead-sync one once its
    // token can read leads. Never touches the token or dataset.
    let pageUpdate: { from: string | null; to: string } | null = null;
    let pageUpdateError: string | null = null;
    if (check.canReadLeads && check.page && check.page.id !== source.page_id) {
      const { error: updateError } = await auth.admin
        .from("simplified_meta_sources")
        .update({ page_id: check.page.id, page_name: check.page.name } as never)
        .eq("id", id)
        .eq("organization_id", auth.orgId);
      if (updateError) {
        pageUpdateError = `Page ${check.page.id} is already connected in another Meta connection — remove this one.`;
      } else {
        pageUpdate = { from: source.page_id, to: check.page.id };
      }
    }

    return NextResponse.json({ check, pageUpdate, pageUpdateError });
  } catch (err) {
    console.error("Check Meta source error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
