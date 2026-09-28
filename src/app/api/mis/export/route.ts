import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveLeadTypeForExport } from "@/lib/campaign-lead-type";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";

export const dynamic = "force-dynamic";

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ];
  return lines.join("\n");
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)
      ?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const url = new URL(request.url);
    const type = (url.searchParams.get("type") || "").toLowerCase();
    const format = (url.searchParams.get("format") || "csv").toLowerCase();
    const campaignId = url.searchParams.get("campaignId");

    if (
      ![
        "all_leads",
        "campaign_leads",
        "qa_approved_leads",
        "qa_rejected_leads",
        "agent_performance",
      ].includes(type)
    ) {
      return NextResponse.json(
        { error: "Invalid export type" },
        { status: 400 }
      );
    }

    if (!["csv", "excel"].includes(format)) {
      return NextResponse.json(
        { error: "Invalid format, use csv or excel" },
        { status: 400 }
      );
    }

    if (type === "campaign_leads" && !campaignId) {
      return NextResponse.json(
        { error: "campaignId is required for campaign_leads export" },
        { status: 400 }
      );
    }

    // Query builders are single-use, so rebuild per page.
    const buildLeadsQuery = () => {
      let q = supabase
        .from("leads")
        .select(
          "id, lead_id, name, company_name, email, phone, status, qa_status, assigned_agent_id, campaign_id, lead_type, created_at"
        )
        .eq("organization_id", orgId);

      if (type === "campaign_leads") {
        q = q.eq("campaign_id", campaignId as string);
      } else if (type === "qa_approved_leads") {
        q = q.in("qa_status", ["approved", "pass"]);
      } else if (type === "qa_rejected_leads") {
        // `.not(col, "in", ...)` needs the PostgREST list literal, not a JS array.
        q = q.not("qa_status", "in", "(approved,pass)");
      }

      return q;
    };

    type ExportLeadRow = {
      id: string;
      lead_id: string | null;
      name: string | null;
      company_name: string | null;
      email: string | null;
      phone: string | null;
      status: string;
      qa_status: string | null;
      assigned_agent_id: string | null;
      campaign_id: string;
      lead_type: string | null;
      created_at: string;
    };

    // PostgREST caps a single response at 1000 rows — page through everything
    // so exports include all leads, not just the first 1000.
    const EXPORT_PAGE_SIZE = 1000;
    const leads: ExportLeadRow[] = [];
    for (let offset = 0; ; offset += EXPORT_PAGE_SIZE) {
      const { data: pageData, error: leadsError } = await buildLeadsQuery()
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + EXPORT_PAGE_SIZE - 1);

      if (leadsError) {
        return NextResponse.json({ error: leadsError.message }, { status: 500 });
      }

      const chunk = (pageData ?? []) as ExportLeadRow[];
      leads.push(...chunk);
      if (chunk.length < EXPORT_PAGE_SIZE) break;
    }

    const agentIds = Array.from(
      new Set(leads.map((l) => l.assigned_agent_id).filter(Boolean))
    ) as string[];
    const campaignIds = Array.from(
      new Set(leads.map((l) => l.campaign_id))
    ) as string[];

    let agentNames: Record<string, string> = {};
    let campaignNames: Record<string, string> = {};
    let campaignLeadTypes: Record<string, string> = {};

    if (agentIds.length > 0) {
      const { data: usersData } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", agentIds);
      (usersData ?? []).forEach((u: any) => {
        agentNames[u.id] = u.full_name || u.email || "Unknown";
      });
    }

    if (campaignIds.length > 0) {
      const { data: campaignsData } = await supabase
        .from("campaigns")
        .select("id, name, lead_type")
        .in("id", campaignIds);
      (campaignsData ?? []).forEach((c: { id: string; name: string | null; lead_type: string | null }) => {
        campaignNames[c.id] = c.name || c.id;
        campaignLeadTypes[c.id] = c.lead_type?.trim() ?? "";
      });
    }

    let rows: Record<string, unknown>[];

    if (type === "agent_performance") {
      const perfMap = new Map<
        string,
        {
          agent_id: string;
          agent_name: string;
          total_leads: number;
          closed_won: number;
          qa_approved: number;
          qa_rejected: number;
        }
      >();

      leads.forEach((l) => {
        const key = l.assigned_agent_id || "__unassigned__";
        if (!perfMap.has(key)) {
          perfMap.set(key, {
            agent_id: key,
            agent_name:
              key === "__unassigned__"
                ? "Unassigned"
                : agentNames[key] ?? "Unknown",
            total_leads: 0,
            closed_won: 0,
            qa_approved: 0,
            qa_rejected: 0,
          });
        }
        const bucket = perfMap.get(key)!;
        bucket.total_leads += 1;
        if (String(l.status || "").toLowerCase() === "closed_won") {
          bucket.closed_won += 1;
        }
        const qa = String(l.qa_status ?? "").trim().toLowerCase();
        if (qa === "approved" || qa === "pass") {
          bucket.qa_approved += 1;
        } else if (qa) {
          bucket.qa_rejected += 1;
        }
      });

      rows = Array.from(perfMap.values()).map((r) => ({
        agent_id: r.agent_id === "__unassigned__" ? "" : r.agent_id,
        agent_name: r.agent_name,
        total_leads: r.total_leads,
        closed_won: r.closed_won,
        qa_approved: r.qa_approved,
        qa_rejected: r.qa_rejected,
      }));
    } else {
      rows = leads.map((l) => ({
        lead_id: l.lead_id ?? l.id,
        name: l.name,
        company_name: l.company_name,
        email: l.email,
        phone: l.phone,
        status: l.status,
        qa_status: l.qa_status,
        agent_id: l.assigned_agent_id,
        agent_name: l.assigned_agent_id
          ? agentNames[l.assigned_agent_id] ?? "Unknown"
          : "Unassigned",
        campaign_id: l.campaign_id,
        campaign_name: campaignNames[l.campaign_id] ?? l.campaign_id,
        "Lead Type": resolveLeadTypeForExport(
          l.lead_type,
          campaignLeadTypes[l.campaign_id]
        ),
        created_at: l.created_at,
      }));
    }

    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: resolvePrimaryAuditRole(await fetchUserRoleNames(supabase, user.id)),
      category: "exports",
      eventType: "lead_export",
      description: `Exported ${rows.length.toLocaleString()} rows (${type}, ${format})`,
      targetType: "export",
      targetLabel: type,
      metadata: { type, format, row_count: rows.length, campaign_id: campaignId },
      request,
    });

    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const ext = format === "excel" ? "xlsx" : "csv";
    const filename = `mis-${type}-${ts}.${ext}`;

    const headers = new Headers();
    headers.set(
      "Content-Type",
      format === "excel"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv; charset=utf-8"
    );
    headers.set(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    if (format === "excel") {
      // Previously this branch shipped CSV bytes with an .xlsx name, which
      // Excel rejects as corrupt. Build a real workbook instead.
      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Export");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
      return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
    }

    return new NextResponse(toCsv(rows), { status: 200, headers });
  } catch (err) {
    console.error("MIS export error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

