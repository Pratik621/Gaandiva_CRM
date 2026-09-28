import { NextResponse } from "next/server";
import { authorizeMarketing } from "@/lib/marketing/meta-auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authorizeMarketing();
    if (!auth.ok) return auth.response;

    const { error } = await auth.admin
      .from("simplified_meta_sources")
      .delete()
      .eq("id", id)
      .eq("organization_id", auth.orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete Meta source error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Pause/resume syncing, or set/clear the Conversions API dataset id. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authorizeMarketing();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const update: Record<string, unknown> = {};
    if (body.status === "active" || body.status === "paused") update.status = body.status;
    if (typeof body.dataset_id === "string") {
      const datasetId = body.dataset_id.trim();
      if (datasetId && !/^\d+$/.test(datasetId)) {
        return NextResponse.json({ error: "Dataset ID must be numeric" }, { status: 400 });
      }
      update.dataset_id = datasetId || null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { error } = await auth.admin
      .from("simplified_meta_sources")
      .update(update as never)
      .eq("id", id)
      .eq("organization_id", auth.orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Update Meta source error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
