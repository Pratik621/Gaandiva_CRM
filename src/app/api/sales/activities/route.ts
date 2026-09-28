import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getUserAndRoles() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

  const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
    .map((r) => r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_"))
    .filter(Boolean) as string[];

  const canAccessSales =
    roleNames.includes("sales") ||
    roleNames.includes("sales_manager") ||
    roleNames.includes("admin");

  if (!canAccessSales) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, roleNames };
}

export async function GET(request: Request) {
  try {
    const ctx = await getUserAndRoles();
    if ("error" in ctx) return ctx.error;
    const { user, roleNames } = ctx;

    const { searchParams } = new URL(request.url);
    const relatedType = searchParams.get("related_to_type") ?? undefined;
    const relatedId = searchParams.get("related_to_id") ?? undefined;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    let query = admin
      .from("activities")
      .select("id, activity_type, related_to_type, related_to_id, notes, activity_date, owner_id, created_at")
      .order("activity_date", { ascending: false });

    const isManagerOrAdmin =
      roleNames.includes("sales_manager") || roleNames.includes("admin");
    if (!isManagerOrAdmin) {
      query = query.eq("owner_id", user!.id);
    }

    if (relatedType) query = query.eq("related_to_type", relatedType);
    if (relatedId) query = query.eq("related_to_id", relatedId);

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const activities = (rows ?? []) as any[];

    const ownerIds = Array.from(
      new Set(activities.map((a) => a.owner_id).filter(Boolean) as string[])
    );
    let ownerNames: Record<string, string> = {};
    if (ownerIds.length > 0) {
      const { data: users } = await admin
        .from("users")
        .select("id, full_name, email")
        .in("id", ownerIds);
      ((users ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach((u) => {
        ownerNames[u.id] = u.full_name || u.email || "Unknown";
      });
    }

    // Resolve related names (best-effort, batched per type)
    const leadsIds = Array.from(new Set(activities.filter((a) => a.related_to_type === "lead").map((a) => a.related_to_id))) as string[];
    const contactIds = Array.from(new Set(activities.filter((a) => a.related_to_type === "contact").map((a) => a.related_to_id))) as string[];
    const dealIds = Array.from(new Set(activities.filter((a) => a.related_to_type === "deal").map((a) => a.related_to_id))) as string[];

    let leadNames: Record<string, string> = {};
    if (leadsIds.length > 0) {
      const { data: leads } = await admin
        .from("sales_leads")
        .select("id, lead_name, first_name, last_name")
        .in("id", leadsIds);
      (leads ?? []).forEach((l: any) => {
        const name =
          (l.lead_name as string | null) ||
          [l.first_name, l.last_name].filter(Boolean).join(" ").trim() ||
          "—";
        leadNames[l.id] = name;
      });
    }

    let contactNames: Record<string, string> = {};
    if (contactIds.length > 0) {
      const { data: contacts } = await admin
        .from("contacts")
        .select("id, contact_name")
        .in("id", contactIds);
      (contacts ?? []).forEach((c: any) => {
        contactNames[c.id] = (c.contact_name as string | null) || "—";
      });
    }

    let dealNames: Record<string, string> = {};
    if (dealIds.length > 0) {
      const { data: deals } = await admin
        .from("deals")
        .select("id, deal_name")
        .in("id", dealIds);
      (deals ?? []).forEach((d: any) => {
        dealNames[d.id] = (d.deal_name as string | null) || "—";
      });
    }

    const shaped = activities.map((a) => {
      const relId = a.related_to_id as string;
      const relType = a.related_to_type as string;
      const relatedName =
        relType === "lead"
          ? leadNames[relId] ?? null
          : relType === "contact"
            ? contactNames[relId] ?? null
            : relType === "deal"
              ? dealNames[relId] ?? null
              : null;

      return {
        id: a.id as string,
        activity_type: a.activity_type as string,
        related_to_type: relType,
        related_to_id: relId,
        related_to_name: relatedName,
        notes: (a.notes as string | null) ?? null,
        activity_date: a.activity_date as string,
        owner_id: (a.owner_id as string | null) ?? null,
        owner_name: a.owner_id ? ownerNames[a.owner_id as string] ?? "—" : null,
        created_at: a.created_at as string,
      };
    });

    return NextResponse.json({ activities: shaped });
  } catch (err) {
    console.error("Sales activities GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getUserAndRoles();
    if ("error" in ctx) return ctx.error;
    const { user } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const body = await request.json();
    const {
      activity_type,
      related_to_type,
      related_to_id,
      notes,
      activity_date,
      owner_id,
    }: {
      activity_type?:
        | "call"
        | "meeting"
        | "email"
        | "demo"
        | "note"
        | "lifecycle_change"
        | "system"
        | "task";
      related_to_type?: "lead" | "contact" | "deal";
      related_to_id?: string;
      notes?: string | null;
      activity_date?: string | null;
      owner_id?: string | null;
    } = body ?? {};

    if (!activity_type) {
      return NextResponse.json({ error: "Activity type is required" }, { status: 400 });
    }
    if (!related_to_type || !related_to_id) {
      return NextResponse.json({ error: "Related record is required" }, { status: 400 });
    }

    const insertPayload = {
      activity_type,
      related_to_type,
      related_to_id,
      notes: notes ?? null,
      activity_date: activity_date ?? new Date().toISOString(),
      owner_id: owner_id ?? user!.id,
    };

    const { data, error }: { data: { id: string } | null; error: { message: string } | null } =
      await admin
      .from("activities")
      .insert(insertPayload as never)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data?.id, success: true }, { status: 201 });
  } catch (err) {
    console.error("Sales activities POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

