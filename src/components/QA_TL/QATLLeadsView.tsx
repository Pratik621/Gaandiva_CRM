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
import { DownloadOutlined } from "@ant-design/icons";
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

type QATLLeadRow = Lead & {
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

const LEADS_API_PATH = "/api/qatl/leads";
const CAMPAIGN_LINK_PREFIX = "/qatl/campaigns";
const QUERY_KEY_PREFIX = ["qatl", "leads"] as const;
const EXPORT_FILENAME_PREFIX = "qatl-leads";

/** Org-wide leads view for QA TL — all leads across the organization. */
export function QATLLeadsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasRole, isInitialized } = useAuth();
  const canAccessPage = hasRole("qa_tl") || hasRole("admin");
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [qaStatusFilter, setQaStatusFilter] = useState<string | undefined>(
    () => searchParams.get("qa_status") ?? undefined
  );
  const { page, pageSize, total, applyPaginationMeta, resetPage, tablePagination } =
    useServerTablePagination();
  const [isOffline, setIsOffline] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setQaStatusFilter(searchParams.get("qa_status") ?? undefined);
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(leadSearch.trim()), 400);
    return () => clearTimeout(t);
  }, [leadSearch]);

  useEffect(() => {
    resetPage();
  }, [debouncedSearch, dateRange, selectedAgentIds, qaStatusFilter, resetPage]);

  const listEnabled =
    isInitialized && canAccessPage && !isOffline && typeof navigator !== "undefined" && navigator.onLine;

  const {
    items: leads,
    pagination,
    response,
    isLoading,
    error,
    refetch,
  } = usePaginatedListQuery<QATLLeadRow>({
    queryKeyPrefix: [...QUERY_KEY_PREFIX],
    url: LEADS_API_PATH,
    params: {
      page,
      limit: pageSize,
      q: debouncedSearch || undefined,
      agent_ids: selectedAgentIds.length > 0 ? selectedAgentIds.join(",") : undefined,
      date_from: dateRange?.[0]?.format("YYYY-MM-DD"),
      date_to: dateRange?.[1]?.format("YYYY-MM-DD"),
      qa_status: qaStatusFilter || undefined,
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
      const url = buildListApiUrl(LEADS_API_PATH, {
        export: "all",
        q: debouncedSearch || undefined,
        agent_ids: selectedAgentIds.length > 0 ? selectedAgentIds.join(",") : undefined,
        date_from: dateRange?.[0]?.format("YYYY-MM-DD"),
        date_to: dateRange?.[1]?.format("YYYY-MM-DD"),
        qa_status: qaStatusFilter || undefined,
      });
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load leads for export");
      const exportLeads = (data.leads ?? []) as QATLLeadRow[];
      if (exportLeads.length === 0) {
        message.warning(
          hasActiveFilters ? "No leads match the current filters to export" : "No leads to export"
        );
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      downloadExcel(
        exportLeads,
        `${EXPORT_FILENAME_PREFIX}-${stamp}${hasActiveFilters ? "-filtered" : ""}.xlsx`
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
    render: (_: unknown, row: QATLLeadRow) =>
      row.campaign_id ? (
        <Link
          href={`${CAMPAIGN_LINK_PREFIX}/${row.campaign_id}`}
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
    render: (_: unknown, row: QATLLeadRow) => row.assigned_agent_name ?? "—",
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
        <Typography.Title level={4} style={{ margin: 0 }}>
          Leads
        </Typography.Title>
        <Typography.Text type="secondary">
          All leads across your organization, including assigned agents and campaign context.
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
              : `${total.toLocaleString()} leads across your organization. Showing page ${page} (${leads.length} rows).`}
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
                : "No leads found for your organization.",
            }}
            size="middle"
          />
        </Card>
    </div>
  );
}
