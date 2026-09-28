"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  Table,
  Button,
  Spin,
  Typography,
  message,
  Row,
  Col,
  DatePicker,
  Input,
  Select,
} from "antd";
import type { Dayjs } from "dayjs";
import { DownloadOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import { usePaginatedListQuery } from "@/hooks/usePaginatedListQuery";
import {
  serverTableInitialLoading,
  useServerTablePagination,
  useSyncListPaginationTotal,
} from "@/hooks/useServerTablePagination";
import { buildListApiUrl } from "@/lib/build-list-api-url";
import { downloadExcel } from "@/lib/leadsExport";
import { getLeadTableColumns } from "@/components/Leads/LeadTableColumns";
import type { Lead } from "@/types/lead.types";

type TLLeadRow = Lead & {
  campaign_id?: string;
  campaign_name?: string | null;
  assigned_agent_name?: string | null;
};

const UNASSIGNED_AGENT_ID = "__unassigned__";

const QA_STATUS_FILTER_OPTIONS = [
  { value: "pending", label: "Pending audit" },
  { value: "qualified", label: "Qualified" },
  { value: "disqualified", label: "Disqualified" },
  { value: "rectified", label: "Rectified" },
] as const;

type AgentOption = { id: string; name: string };

type TeamLeaderLeadsPageProps = {
  /** MIS / EMM / MIS TL reuse this page with org-wide leads and role-specific campaign links. */
  variant?: "tl" | "mis" | "emm" | "mistl";
};

/** Reusable view — MIS/EMM/MIS TL render this with org-wide variant; TL is the default. */
export function TeamLeaderLeadsView({ variant = "tl" }: TeamLeaderLeadsPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasTLAccess, hasRole, isInitialized } = useAuth();
  const isOrgWideView = variant === "mis" || variant === "emm" || variant === "mistl";
  const canAccessPage = isOrgWideView
    ? variant === "emm"
      ? hasRole("email_marketing_manager") || hasRole("admin")
      : variant === "mistl"
        ? hasRole("mis_tl") || hasRole("admin")
        : hasRole("mis") || hasRole("admin")
    : hasTLAccess();
  const leadsApiPath = isOrgWideView
    ? variant === "mistl"
      ? "/api/mistl/leads"
      : "/api/mis/leads"
    : "/api/tl/leads";
  const campaignLinkPrefix =
    variant === "emm"
      ? "/emm/campaigns"
      : variant === "mistl"
        ? "/mistl/campaigns"
        : variant === "mis"
          ? "/mis/campaigns"
          : "/tl/campaigns";
  const queryKeyPrefix =
    variant === "emm"
      ? (["emm", "leads"] as const)
      : variant === "mistl"
        ? (["mistl", "leads"] as const)
        : variant === "mis"
          ? (["mis", "leads"] as const)
          : (["tl", "leads"] as const);
  const exportFilenamePrefix =
    variant === "emm"
      ? "emm-leads"
      : variant === "mistl"
        ? "mistl-leads"
        : variant === "mis"
          ? "mis-leads"
          : "tl-leads";
  const fromDashboard = variant === "tl" && searchParams.get("from") === "dashboard";
  const fromCampaigns = variant === "tl" && searchParams.get("from") === "campaigns";
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [qaStatusFilter, setQaStatusFilter] = useState<string | undefined>(
    () => searchParams.get("qa_status") ?? undefined
  );
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<string | undefined>(
    () => searchParams.get("delivery_status") ?? undefined
  );
  const { page, pageSize, total, applyPaginationMeta, resetPage, tablePagination } =
    useServerTablePagination();
  const [isOffline, setIsOffline] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setQaStatusFilter(searchParams.get("qa_status") ?? undefined);
    setDeliveryStatusFilter(searchParams.get("delivery_status") ?? undefined);
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(leadSearch.trim()), 400);
    return () => clearTimeout(t);
  }, [leadSearch]);

  useEffect(() => {
    resetPage();
  }, [debouncedSearch, dateRange, selectedAgentIds, qaStatusFilter, deliveryStatusFilter, resetPage]);

  const listEnabled =
    isInitialized && canAccessPage && !isOffline && typeof navigator !== "undefined" && navigator.onLine;

  const {
    items: leads,
    pagination,
    response,
    isLoading,
    error,
    refetch,
  } = usePaginatedListQuery<TLLeadRow>({
    queryKeyPrefix: [...queryKeyPrefix],
    url: leadsApiPath,
    params: {
      page,
      limit: pageSize,
      q: debouncedSearch || undefined,
      agent_ids: selectedAgentIds.length > 0 ? selectedAgentIds.join(",") : undefined,
      date_from: dateRange?.[0]?.format("YYYY-MM-DD"),
      date_to: dateRange?.[1]?.format("YYYY-MM-DD"),
      qa_status: qaStatusFilter || undefined,
      delivery_status: deliveryStatusFilter || undefined,
    },
    listField: "leads",
    enabled: listEnabled,
  });

  useSyncListPaginationTotal(pagination, applyPaginationMeta);

  useEffect(() => {
    if (error) {
      message.error(error instanceof Error ? error.message : "Failed to load leads");
    }
  }, [error]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      void refetch();
    };
    const handleOffline = () => setIsOffline(true);

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, [refetch]);

  const agentOptionsFromApi = useMemo(
    () => (response?.agents as AgentOption[] | undefined) ?? [],
    [response?.agents]
  );

  const agentOptions = useMemo(() => {
    const options = agentOptionsFromApi.map((a) => ({ value: a.id, label: a.name }));
    return [{ value: UNASSIGNED_AGENT_ID, label: "Unassigned" }, ...options];
  }, [agentOptionsFromApi]);

  const hasActiveFilters = Boolean(
    debouncedSearch ||
      selectedAgentIds.length > 0 ||
      qaStatusFilter ||
      deliveryStatusFilter ||
      (dateRange?.[0] && dateRange?.[1])
  );

  const updateQaStatusFilter = (value: string | undefined) => {
    setQaStatusFilter(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("qa_status", value);
    } else {
      params.delete("qa_status");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const clearFilters = () => {
    setLeadSearch("");
    setDateRange(null);
    setSelectedAgentIds([]);
    setDeliveryStatusFilter(undefined);
    updateQaStatusFilter(undefined);
  };

  const handleExport = async () => {
    if (total === 0) {
      message.warning(
        hasActiveFilters ? "No leads match the current filters to export" : "No leads to export"
      );
      return;
    }
    setExporting(true);
    try {
      const url = buildListApiUrl(leadsApiPath, {
        export: "all",
        q: debouncedSearch || undefined,
        agent_ids: selectedAgentIds.length > 0 ? selectedAgentIds.join(",") : undefined,
        date_from: dateRange?.[0]?.format("YYYY-MM-DD"),
        date_to: dateRange?.[1]?.format("YYYY-MM-DD"),
        qa_status: qaStatusFilter || undefined,
        delivery_status: deliveryStatusFilter || undefined,
      });
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load leads for export");
      const exportLeads = (data.leads ?? []) as TLLeadRow[];
      if (exportLeads.length === 0) {
        message.warning(
          hasActiveFilters ? "No leads match the current filters to export" : "No leads to export"
        );
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      downloadExcel(
        exportLeads,
        `${exportFilenamePrefix}-${stamp}${hasActiveFilters ? "-filtered" : ""}.xlsx`
      );
      message.success(
        `Exported ${exportLeads.length} lead${exportLeads.length !== 1 ? "s" : ""}${
          hasActiveFilters ? " (filtered)" : ""
        }`
      );
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to export leads");
    } finally {
      setExporting(false);
    }
  };

  const showInitialLoading = serverTableInitialLoading(isLoading, leads.length);

  const baseColumns = getLeadTableColumns({
    showActions: false,
    pagination: { current: page, pageSize },
    showDeliveryStatus: true,
    showQaStatus: true,
  });
  const campaignColumn = {
    title: "Campaign",
    key: "campaign_name",
    width: 180,
    fixed: "left" as const,
    ellipsis: true,
    render: (_: unknown, row: TLLeadRow) =>
      row.campaign_id ? (
        <Link
          href={`${campaignLinkPrefix}/${row.campaign_id}`}
          style={{ fontWeight: 500 }}
          onClick={(e) => e.stopPropagation()}
        >
          {row.campaign_name ?? "—"}
        </Link>
      ) : (
        (row.campaign_name as string) ?? "—"
      ),
  };

  const assignedAgentColumn = {
    title: "Assigned Agent",
    key: "assigned_agent_name",
    width: 170,
    ellipsis: true,
    render: (_: unknown, row: TLLeadRow) => row.assigned_agent_name ?? "—",
  };

  const columns = [
    baseColumns[0],
    baseColumns[1],
    campaignColumn,
    assignedAgentColumn,
    ...baseColumns.slice(2),
  ];

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 320 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!canAccessPage) {
    return null;
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        padding: "0 clamp(12px, 2vw, 24px) 32px",
        overflowX: "hidden",
      }}
    >
      <div style={{ marginBottom: 24 }}>
        {fromDashboard && (
          <Button
            icon={<ArrowLeftOutlined />}
            type="link"
            style={{ padding: 0, marginBottom: 8 }}
            onClick={() => router.push("/tl/dashboard")}
          >
            Back to Dashboard
          </Button>
        )}
        {fromCampaigns && (
          <Button
            icon={<ArrowLeftOutlined />}
            type="link"
            style={{ padding: 0, marginBottom: 8 }}
            onClick={() => router.push("/tl/campaigns")}
          >
            Back to Campaigns
          </Button>
        )}
        <Typography.Title level={4} style={{ margin: 0 }}>
          Leads
        </Typography.Title>
        <Typography.Text type="secondary">
          {isOrgWideView
            ? "All leads across your organization, including assigned agents and campaign context."
            : "All leads from your campaigns, including assigned agents and campaign context."}
        </Typography.Text>
      </div>

        {isOffline && (
          <div style={{ marginBottom: 16 }}>
            <Typography.Text type="danger" style={{ fontSize: 14 }}>
              You appear to be offline. Data will reload automatically once you are back online, or{" "}
              <Button type="link" onClick={() => void refetch()} style={{ padding: 0 }}>
                click here to retry now
              </Button>
              .
            </Typography.Text>
          </div>
        )}

        <Card
          title={`Leads (${total.toLocaleString()})`}
          extra={
            <Button
              icon={<DownloadOutlined />}
              onClick={() => void handleExport()}
              loading={exporting}
              disabled={total === 0 || exporting}
            >
              Export
            </Button>
          }
          bodyStyle={{ padding: "24px 28px" }}
        >
          <Row
            gutter={[12, 12]}
            wrap
            align="middle"
            style={{ marginBottom: 16, marginInline: 0 }}
          >
            <Col xs={24} sm={12} md={8} lg={6}>
              <Typography.Text type="secondary" style={{ display: "block", marginBottom: 6 }}>
                Agents
              </Typography.Text>
              <Select
                mode="multiple"
                placeholder="All agents"
                allowClear
                maxTagCount="responsive"
                showSearch
                optionFilterProp="label"
                options={agentOptions}
                value={selectedAgentIds}
                onChange={setSelectedAgentIds}
                style={{ width: "100%" }}
                disabled={agentOptions.length === 0}
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={5}>
              <Typography.Text type="secondary" style={{ display: "block", marginBottom: 6 }}>
                QA status
              </Typography.Text>
              <Select
                placeholder="All QA statuses"
                allowClear
                options={[...QA_STATUS_FILTER_OPTIONS]}
                value={qaStatusFilter}
                onChange={(value) => updateQaStatusFilter(value ?? undefined)}
                style={{ width: "100%" }}
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={5}>
              <Typography.Text type="secondary" style={{ display: "block", marginBottom: 6 }}>
                Delivery status
              </Typography.Text>
              <Select
                placeholder="All delivery statuses"
                allowClear
                options={[
                  { value: "pending", label: "Pending" },
                  { value: "delivered", label: "Delivered" },
                  { value: "not_delivered", label: "Not Delivered" },
                  { value: "client_rejected", label: "Client Rejected" },
                ]}
                value={deliveryStatusFilter}
                onChange={(value) => setDeliveryStatusFilter(value ?? undefined)}
                style={{ width: "100%" }}
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={5}>
              <Typography.Text type="secondary" style={{ display: "block", marginBottom: 6 }}>
                Date range (created)
              </Typography.Text>
              <DatePicker.RangePicker
                value={dateRange}
                onChange={(dates) => setDateRange(dates as [Dayjs | null, Dayjs | null] | null)}
                allowClear
                style={{ width: "100%" }}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={6}>
              <Typography.Text type="secondary" style={{ display: "block", marginBottom: 6 }}>
                Search
              </Typography.Text>
              <Input.Search
                placeholder="Lead ID, name, company, email, phone, campaign..."
                allowClear
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                style={{ width: "100%" }}
              />
            </Col>
            <Col xs={24} sm={24} md={24} lg={3}>
              <Typography.Text type="secondary" style={{ display: "block", marginBottom: 6 }}>
                &nbsp;
              </Typography.Text>
              <Button
                size="middle"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                block
              >
                Clear filters
              </Button>
            </Col>
          </Row>

          <Typography.Text type="secondary" style={{ fontSize: 13, display: "block", marginBottom: 12 }}>
            {hasActiveFilters
              ? `${total.toLocaleString()} leads match your filters. Showing page ${page} (${leads.length} rows).`
              : isOrgWideView
                ? `${total.toLocaleString()} leads across your organization. Showing page ${page} (${leads.length} rows).`
                : `${total.toLocaleString()} leads across your campaigns. Showing page ${page} (${leads.length} rows).`}
          </Typography.Text>

          <Table
            className="table-single-line"
            columns={columns}
            dataSource={leads}
            rowKey="id"
            loading={showInitialLoading}
            scroll={{ x: 3200 }}
            pagination={tablePagination}
            locale={{
              emptyText: hasActiveFilters
                ? "No leads match the current filters."
                : isOrgWideView
                  ? "No leads found for your organization."
                  : "No leads found for your assigned campaigns.",
            }}
            size="middle"
          />
        </Card>
    </div>
  );
}
