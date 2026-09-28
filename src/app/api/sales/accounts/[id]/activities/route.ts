import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getCtx() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase.from("users").select("organization_id").eq("id", user.id).single();
  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };

  const { data: roleRows } = await supabase.from("user_roles").select("roles(name)").eq("user_id", user.id);
  const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
    .map((r) => r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_"))
    .filter(Boolean) as string[];
  const can = roleNames.includes("sales") || roleNames.includes("sales_manager") || roleNames.includes("admin");
  if (!can) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return { user, orgId, roleNames };
}

/** Fetch the lead IDs that belong to this account. */
async function getLeadIds(admin: ReturnType<typeof getAdminClientSafe>, orgId: string, accountId: string) {
  if (!admin) return [] as string[];
  const { data } = await admin
    .from("sales_leads")
    .select("id")
    .eq("organization_id", orgId)
    .eq("account_id", accountId);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getCtx();
    if ("error" in ctx) return ctx.error;
    const { orgId } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });

    const leadIds = await getLeadIds(admin, orgId, params.id);

    // Gather activities: account-level + all lead-level
    const queries: Promise<{ data: unknown[] | null; error: unknown }>[] = [];

    // Account-level activities
    queries.push(
      admin.from("activities")
        .select("id, activity_type, related_to_type, related_to_id, notes, activity_date, owner_id, created_at")
        .eq("related_to_type", "account")
        .eq("related_to_id", params.id)
        .order("activity_date", { ascending: false }) as never
    );

    // Lead-level activities in a single IN query (if there are leads)
    if (leadIds.length > 0) {
      queries.push(
        admin.from("activities")
          .select("id, activity_type, related_to_type, related_to_id, notes, activity_date, owner_id, created_at")
          .eq("related_to_type", "lead")
          .in("related_to_id", leadIds)
          .order("activity_date", { ascending: false }) as never
      );
    }

    const results = await Promise.all(queries);
    const allRows = results.flatMap((r) => (r as { data: unknown[] | null }).data ?? []) as Record<string, unknown>[];

    // Sort all by date desc
    allRows.sort((a, b) =>
      new Date(b.activity_date as string).getTime() - new Date(a.activity_date as string).getTime()
    );

    // Enrich owner names
    const ownerIds = Array.from(new Set(allRows.map((a) => a.owner_id).filter(Boolean) as string[]));
    const userNames: Record<string, string> = {};
    if (ownerIds.length > 0) {
      const { data: users } = await admin.from("users").select("id, full_name, email").in("id", ownerIds);
      ((users ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach((u) => {
        userNames[u.id] = u.full_name || u.email || "Unknown";
      });
    }

    // Enrich lead names for lead-linked activities
    const leadNames: Record<string, string> = {};
    if (leadIds.length > 0) {
      const { data: lrows } = await admin
        .from("sales_leads")
        .select("id, lead_name, first_name, last_name")
        .in("id", leadIds);
      ((lrows ?? []) as Record<string, unknown>[]).forEach((l) => {
        const name =
          (l.lead_name as string | null) ||
          [l.first_name, l.last_name].filter((p) => p && String(p).trim()).join(" ").trim() ||
          "Unnamed";
        leadNames[l.id as string] = name;
      });
    }

    const shaped = allRows.map((a) => ({
      id: a.id as string,
      activity_type: a.activity_type as string,
      related_to_type: a.related_to_type as string,
      related_to_id: a.related_to_id as string,
      related_lead_name: a.related_to_type === "lead" ? (leadNames[a.related_to_id as string] ?? null) : null,
      notes: (a.notes as string | null) ?? null,
      activity_date: a.activity_date as string,
      owner_id: (a.owner_id as string | null) ?? null,
      owner_name: a.owner_id ? userNames[a.owner_id as string] ?? "—" : null,
      created_at: a.created_at as string,
    }));

    return NextResponse.json({ activities: shaped });
  } catch (err) {
    console.error("Account activities GET:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const ALLOWED_TYPES = new Set(["call", "meeting", "email", "demo", "note", "task"]);

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getCtx();
    if ("error" in ctx) return ctx.error;
    const { user } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });

    const body = await request.json() as Record<string, unknown>;
    const activity_type = body.activity_type as string | undefined;
    const notes = (body.notes as string | null) ?? null;
    const activity_date = (body.activity_date as string | null) ?? new Date().toISOString();

    if (!activity_type || !ALLOWED_TYPES.has(activity_type))
      return NextResponse.json({ error: "Invalid activity_type" }, { status: 400 });
    if (activity_type === "note" && (!notes || !String(notes).trim()))
      return NextResponse.json({ error: "Note text is required" }, { status: 400 });

    const { data, error } = await admin
      .from("activities")
      .insert({
        activity_type,
        related_to_type: "account",
        related_to_id: params.id,
        notes: notes?.trim() || null,
        activity_date,
        owner_id: user.id,
      } as never)
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ id: (data as { id: string }).id, success: true }, { status: 201 });
  } catch (err) {
    console.error("Account activities POST:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
