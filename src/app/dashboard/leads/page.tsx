"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  Row,
  Select,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import type { ColumnsType } from "antd/es/table";
import { DownloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import { useAuthReady } from "@/hooks/useAuthReady";
import {
  PAGINATION_SYNC_TOTAL_ONLY,
  serverTableInitialLoading,
  useServerTablePagination,
} from "@/hooks/useServerTablePagination";
import { fetchWithAuthRetry } from "@/lib/api/fetch-with-auth-retry";
import { buildListApiUrl } from "@/lib/build-list-api-url";
import { tableEllipsisCell } from "@/lib/table-ellipsis-cell";
import { tableSerialNumber } from "@/lib/table-pagination";

function escapeCsvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatDateTime(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const { Title, Text, Link } = Typography;
const { RangePicker } = DatePicker;

interface LeadRow {
  id: string;
  name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: string;
  consent_status: string | null;
  delivery_status?: string | null;
  delivered_at?: string | null;
  created_at: string;
  registered_at: string | null;
  campaign_id: string;
  campaigns?: {
    id?: string;
    name?: string;
    campaign_id?: string;
  } | null;
}

type CampaignOption = {
  id: string;
  name: string;
  campaign_id: string | null;
};

export default function DashboardLeadsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const authReady = useAuthReady();
  const { authVersion, hasRole } = useAuth();
  const urlCampaignId = sp.get("campaign_id");

  const isClientViewer =
    hasRole("client_viewer") &&
    !hasRole("internal_operator") &&
    !hasRole("internal_admin") &&
    !hasRole("admin");

  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [campaignPicker, setCampaignPicker] = useState<string | undefined>(
    urlCampaignId ?? undefined
  );
  const { page, pageSize, total, applyPaginationMeta, resetPage, tablePagination } =
    useServerTablePagination();

  const activeCampaignId = campaignPicker ?? urlCampaignId ?? undefined;

  useEffect(() => {
    setCampaignPicker(urlCampaignId ?? undefined);
  }, [urlCampaignId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    resetPage();
  }, [debouncedSearch, dateRange, activeCampaignId, resetPage]);

  const campaignsQuery = useQuery({
    queryKey: ["command", "campaigns", "leads-picker", authVersion],
    queryFn: async () => {
      const url = buildListApiUrl("/api/command/campaigns", { limit: 100 });
      const res = await fetchWithAuthRetry(url);
      const data = (await res.json()) as { campaigns?: CampaignOption[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load campaigns");
      return data.campaigns ?? [];
    },
    enabled: authReady && isClientViewer,
    staleTime: 60_000,
  });

  const listUrl = buildListApiUrl("/api/command/leads", {
    page,
    limit: pageSize,
    q: debouncedSearch || undefined,
    campaign_id: activeCampaignId,
    date_from: dateRange?.[0]?.format("YYYY-MM-DD"),
    date_to: dateRange?.[1]?.format("YYYY-MM-DD"),
    ...(isClientViewer ? { sort: "delivered_at", sort_dir: "desc" } : {}),
  });

  const leadsQuery = useQuery({
    queryKey: ["command", "leads", "list", listUrl, authVersion],
    queryFn: async () => {
      const res = await fetchWithAuthRetry(listUrl);
      const data = (await res.json()) as {
        leads?: LeadRow[];
        error?: string;
        total?: number;
        page?: number;
        limit?: number;
        totalPages?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch leads");
      return data;
    },
    enabled: authReady,
    placeholderData: (previous) => previous,
  });

  const rows = leadsQuery.data?.leads ?? [];
  const loading = serverTableInitialLoading(leadsQuery.isLoading, rows.length);

  const leadsListTotal = leadsQuery.data?.total;

  useEffect(() => {
    if (typeof leadsListTotal !== "number") return;
    applyPaginationMeta(
      {
        page: 1,
        limit: pageSize,
        total: leadsListTotal,
        totalPages: pageSize > 0 ? Math.ceil(leadsListTotal / pageSize) : 0,
      },
      PAGINATION_SYNC_TOTAL_ONLY
    );
  }, [leadsListTotal, pageSize, applyPaginationMeta]);

  useEffect(() => {
    if (leadsQuery.error) {
      message.error(
        leadsQuery.error instanceof Error ? leadsQuery.error.message : "Failed to fetch leads"
      );
    }
  }, [leadsQuery.error]);

  const handleExportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const url = buildListApiUrl("/api/command/leads", {
        page: 1,
        limit: 100,
        q: debouncedSearch || undefined,
        campaign_id: activeCampaignId,
        date_from: dateRange?.[0]?.format("YYYY-MM-DD"),
        date_to: dateRange?.[1]?.format("YYYY-MM-DD"),
        ...(isClientViewer ? { sort: "delivered_at", sort_dir: "desc" } : {}),
      });
      const res = await fetchWithAuthRetry(url);
      const data = (await res.json()) as { leads?: LeadRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch leads for export");
      const exportRows = data.leads ?? [];
      if (exportRows.length === 0) {
        message.warning("No leads match the current filters to export.");
        return;
      }
      const header = isClientViewer
        ? [
            "Lead Name",
            "Company",
            "Email",
            "Phone",
            "City",
            "Campaign",
            "Campaign Ref",
            "Delivered At",
            "Client LP Reg Timestamp",
          ]
        : [
            "Lead Name",
            "Company",
            "Email",
            "Phone",
            "City",
            "Client LP Reg Timestamp",
            "Campaign",
            "Campaign Ref",
            "Status",
            "Consent",
            "Created At",
          ];
      const lines = [header.map(escapeCsvCell).join(",")];
      for (const r of exportRows) {
        const lp = r.registered_at ? new Date(r.registered_at).toISOString() : "";
        const campaignName = r.campaigns?.name ?? "";
        const campaignRef = r.campaigns?.campaign_id ?? "";
        if (isClientViewer) {
          lines.push(
            [
              r.name ?? "",
              r.company_name ?? "",
              r.email ?? "",
              r.phone ?? "",
              r.city ?? "",
              campaignName,
              campaignRef,
              r.delivered_at ?? "",
              lp,
            ]
              .map(escapeCsvCell)
              .join(",")
          );
        } else {
          lines.push(
            [
              r.name ?? "",
              r.company_name ?? "",
              r.email ?? "",
              r.phone ?? "",
              r.city ?? "",
              lp,
              campaignName,
              campaignRef,
              r.status ?? "",
              r.consent_status ?? "",
              r.created_at ?? "",
            ]
              .map(escapeCsvCell)
              .join(",")
          );
        }
      }
      const csv = `\uFEFF${lines.join("\n")}\n`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const urlObj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = dayjs().format("YYYY-MM-DD_HHmm");
      a.href = urlObj;
      a.download = `leads-export_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(urlObj);
      message.success(`Exported ${exportRows.length} lead(s).`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [debouncedSearch, activeCampaignId, dateRange, isClientViewer]);

  const campaignOptions = useMemo(
    () =>
      (campaignsQuery.data ?? []).map((c) => ({
        value: c.id,
        label: c.campaign_id ? `${c.name} (${c.campaign_id})` : c.name,
      })),
    [campaignsQuery.data]
  );

  const columns: ColumnsType<LeadRow> = useMemo(() => {
    if (isClientViewer) {
      return [
        {
          title: "Sr.",
          key: "sr",
          width: 56,
          fixed: "left",
          render: (_: unknown, __: LeadRow, index: number) =>
            tableSerialNumber(page, pageSize, index),
        },
        {
          title: "Lead",
          key: "lead",
          width: 160,
          ellipsis: true,
          fixed: "left",
          render: (_, r) => (
            <div style={{ minWidth: 0 }}>
              <div className="table-text-ellipsis" style={{ fontWeight: 600 }}>
                {r.name ?? "—"}
              </div>
              <div
                className="table-text-ellipsis"
                style={{ fontSize: 12, color: "#6b7280" }}
              >
                {r.company_name ?? "—"}
              </div>
            </div>
          ),
        },
        {
          title: "Email",
          dataIndex: "email",
          key: "email",
          width: 180,
          ellipsis: true,
          responsive: ["md"],
          render: (v: string | null) => tableEllipsisCell(v),
        },
        {
          title: "Phone",
          dataIndex: "phone",
          key: "phone",
          width: 120,
          ellipsis: true,
          render: (v: string | null) => tableEllipsisCell(v),
        },
        {
          title: "City",
          dataIndex: "city",
          key: "city",
          width: 100,
          ellipsis: true,
          responsive: ["lg"],
          render: (v: string | null) => tableEllipsisCell(v),
        },
        {
          title: "Campaign",
          key: "campaign",
          width: 150,
          ellipsis: true,
          render: (_, r) => {
            const label = r.campaigns?.name ?? r.campaigns?.campaign_id ?? "—";
            if (r.campaigns?.id) {
              return (
                <Link
                  onClick={() => router.push(`/dashboard/campaigns/${r.campaigns?.id}`)}
                  className="table-text-ellipsis"
                  style={{ display: "block" }}
                >
                  {label}
                </Link>
              );
            }
            return tableEllipsisCell(label);
          },
        },
        {
          title: "Delivered",
          dataIndex: "delivered_at",
          key: "delivered_at",
          width: 150,
          render: (v: string | null) => (
            <Text style={{ fontSize: 13 }}>{formatDateTime(v)}</Text>
          ),
        },
        {
          title: "LP Registered",
          dataIndex: "registered_at",
          key: "registered_at",
          width: 150,
          responsive: ["xl"],
          render: (v: string | null) => (
            <Text style={{ fontSize: 13 }} type={v ? undefined : "secondary"}>
              {formatDateTime(v)}
            </Text>
          ),
        },
      ];
    }

    return [
      {
        title: "Lead",
        key: "lead",
        width: 180,
        ellipsis: true,
        render: (_, r) => (
          <div>
            <div style={{ fontWeight: 600 }}>{r.name ?? "—"}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{r.company_name ?? "—"}</div>
          </div>
        ),
      },
      {
        title: "Email",
        dataIndex: "email",
        key: "email",
        width: 180,
        ellipsis: true,
        render: (v: string | null) => tableEllipsisCell(v),
      },
      {
        title: "Phone",
        dataIndex: "phone",
        key: "phone",
        width: 120,
        ellipsis: true,
        render: (v: string | null) => tableEllipsisCell(v),
      },
      {
        title: "City",
        dataIndex: "city",
        key: "city",
        width: 100,
        ellipsis: true,
        render: (v: string | null) => tableEllipsisCell(v),
      },
      {
        title: "Client LP Reg Timestamp",
        dataIndex: "registered_at",
        key: "registered_at",
        width: 180,
        render: (v: string | null) => (
          <Text style={{ fontSize: 13 }} type={v ? undefined : "secondary"}>
            {formatDateTime(v)}
          </Text>
        ),
      },
      {
        title: "Campaign",
        key: "campaign",
        width: 160,
        ellipsis: true,
        render: (_, r) =>
          r.campaigns?.id ? (
            <Link onClick={() => router.push(`/dashboard/campaigns/${r.campaigns?.id}`)}>
              {r.campaigns?.name ?? r.campaigns?.campaign_id ?? "Campaign"}
            </Link>
          ) : (
            <Text type="secondary">{r.campaigns?.name ?? "—"}</Text>
          ),
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        width: 100,
        render: (v: string) => <Tag>{(v ?? "new").toUpperCase()}</Tag>,
      },
      {
        title: "Consent",
        dataIndex: "consent_status",
        key: "consent_status",
        width: 110,
        render: (v: string | null) => (
          <Tag color={v === "verified" ? "green" : "orange"}>
            {(v ?? "pending").toUpperCase()}
          </Tag>
        ),
      },
    ];
  }, [isClientViewer, page, pageSize, router]);

  const subtitle = isClientViewer
    ? activeCampaignId
      ? `Delivered leads for selected campaign · ${total.toLocaleString()} total`
      : `Delivered leads from your assigned campaigns · ${total.toLocaleString()} total`
    : activeCampaignId
      ? `Showing leads for campaign: ${activeCampaignId}`
      : "All campaign leads";

  return (
    <div style={{ maxWidth: "100%", overflow: "hidden" }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          {isClientViewer ? "Delivered Leads" : "Leads"}
        </Title>
        <Text type="secondary">{subtitle}</Text>
      </div>

      <Card styles={{ body: { padding: "16px 16px 8px" } }}>
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} md={isClientViewer ? 8 : 10}>
            <Input
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              prefix={<SearchOutlined />}
              placeholder={
                isClientViewer
                  ? "Search lead, company, email, phone…"
                  : "Search by lead/company/email/phone/campaign"
              }
            />
          </Col>
          {isClientViewer && (
            <Col xs={24} md={8}>
              <Select
                allowClear
                showSearch
                placeholder="All assigned campaigns"
                optionFilterProp="label"
                value={campaignPicker}
                onChange={(v) => {
                  setCampaignPicker(v);
                  if (v) {
                    router.replace(`/dashboard/leads?campaign_id=${encodeURIComponent(v)}`);
                  } else {
                    router.replace("/dashboard/leads");
                  }
                }}
                options={campaignOptions}
                loading={campaignsQuery.isLoading}
                style={{ width: "100%" }}
              />
            </Col>
          )}
          <Col xs={24} md={isClientViewer ? 8 : 8}>
            <RangePicker
              value={dateRange}
              onChange={(v) => {
                if (!v || !v[0] || !v[1]) {
                  setDateRange(null);
                  return;
                }
                setDateRange([v[0], v[1]]);
              }}
              allowClear
              format="YYYY-MM-DD"
              placeholder={
                isClientViewer ? ["Delivered from", "Delivered to"] : ["Created from", "Created to"]
              }
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} md={isClientViewer ? 24 : 6} style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              loading={exporting}
              disabled={loading}
              onClick={() => void handleExportCsv()}
              block={isClientViewer}
              style={isClientViewer ? undefined : { width: "100%" }}
            >
              Export CSV
            </Button>
          </Col>
        </Row>

        <Table
          className="table-single-line"
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={tablePagination}
          scroll={{ x: isClientViewer ? 960 : 1100 }}
          tableLayout="fixed"
          size="middle"
          locale={{
            emptyText: isClientViewer
              ? "No delivered leads yet for your assigned campaigns."
              : "No leads found.",
          }}
        />
      </Card>
    </div>
  );
}
