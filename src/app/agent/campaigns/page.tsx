"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Table, Tag, Button, Input, Select, Spin, Typography, Tooltip, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  EyeOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { usePaginatedListQuery } from "@/hooks/usePaginatedListQuery";
import {
  serverTableInitialLoading,
  useServerTablePagination,
  useSyncListPaginationTotal,
} from "@/hooks/useServerTablePagination";
import { tableEllipsisCell } from "@/lib/table-ellipsis-cell";
import { tableSerialNumber } from "@/lib/table-pagination";

type AgentCampaignRow = {
  id: string;
  campaign_code: string | null;
  name: string;
  client_name: string | null;
  lead_type: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  total_leads: number;
  billable_leads_count?: number;
  qualified_leads: number;
};

const statusColors: Record<string, string> = {
  draft: "default",
  active: "green",
  paused: "orange",
  completed: "success",
};

export default function AgentCampaignsPage() {
  const router = useRouter();
  const { hasRole, isInitialized } = useAuth();
  const [isOffline, setIsOffline] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const { page, pageSize, applyPaginationMeta, resetPage, tablePagination } =
    useServerTablePagination();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText.trim()), 400);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    resetPage();
  }, [debouncedSearch, statusFilter, resetPage]);

  const listEnabled =
    isInitialized &&
    hasRole("agent") &&
    !isOffline &&
    typeof navigator !== "undefined" &&
    navigator.onLine;

  const {
    items: campaigns,
    pagination,
    isLoading,
    error: campaignsError,
    refetch,
  } = usePaginatedListQuery<AgentCampaignRow>({
    queryKeyPrefix: ["agent", "campaigns", "list"],
    url: "/api/agent/campaigns",
    params: {
      page,
      limit: pageSize,
      q: debouncedSearch || undefined,
      status: statusFilter || undefined,
    },
    listField: "campaigns",
    enabled: listEnabled,
  });

  useSyncListPaginationTotal(pagination, applyPaginationMeta);

  useEffect(() => {
    if (campaignsError) {
      message.error(
        campaignsError instanceof Error
          ? campaignsError.message
          : "Failed to load assigned campaigns"
      );
    }
  }, [campaignsError]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!hasRole("agent")) {
      router.replace("/login");
    }
  }, [isInitialized, hasRole, router]);

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

  const loading = serverTableInitialLoading(isLoading, campaigns.length);

  const columns: ColumnsType<AgentCampaignRow> = useMemo(
    () => [
      {
        title: "Sr. No",
        key: "index",
        width: 80,
        render: (_: unknown, __: AgentCampaignRow, index: number) =>
          tableSerialNumber(page, pageSize, index),
      },
      {
        title: "Campaign Code",
        dataIndex: "campaign_code",
        key: "campaign_code",
        width: 130,
        render: (val: string | null) => (
          <Tag color="blue" style={{ fontFamily: "monospace", fontSize: 12 }}>
            {val || "—"}
          </Tag>
        ),
      },
      {
        title: "Campaign",
        dataIndex: "name",
        key: "name",
        width: 160,
        ellipsis: true,
        render: (val: string, r: AgentCampaignRow, index: number) => (
          <Tooltip title={val}>
            <Link
              href={`/agent/campaigns/${r.id}`}
              data-tour={index === 0 ? "agent-campaign-name" : undefined}
              style={{ fontWeight: 600 }}
              className="table-text-ellipsis"
            >
              {val}
            </Link>
          </Tooltip>
        ),
      },
      {
        title: "Lead Type",
        dataIndex: "lead_type",
        key: "lead_type",
        width: 120,
        ellipsis: true,
        render: (v: string | null) => tableEllipsisCell(v),
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        width: 100,
        render: (val: string) => (
          <Tag color={statusColors[val] ?? "default"} style={{ textTransform: "capitalize" }}>
            {val}
          </Tag>
        ),
      },
      {
        title: "Billable Leads",
        dataIndex: "billable_leads_count",
        key: "billable_leads_count",
        width: 120,
        align: "center" as const,
        render: (v: number | undefined) => {
          const count = v ?? 0;
          return (
            <Tag color={count > 0 ? "cyan" : "default"} style={{ margin: 0, fontWeight: 600 }}>
              {count}
            </Tag>
          );
        },
      },
      {
        title: "Start Date",
        dataIndex: "start_date",
        key: "start_date",
        width: 110,
        render: (v: string | null) =>
          v ? new Date(v).toLocaleDateString() : "—",
      },
      {
        title: "End Date",
        dataIndex: "end_date",
        key: "end_date",
        width: 110,
        render: (v: string | null) =>
          v ? new Date(v).toLocaleDateString() : "—",
      },
      {
        title: "Leads",
        dataIndex: "total_leads",
        key: "total_leads",
        width: 100,
      },
      {
        title: "Qualified",
        dataIndex: "qualified_leads",
        key: "qualified_leads",
        width: 96,
        align: "center" as const,
        sorter: (a: AgentCampaignRow, b: AgentCampaignRow) =>
          (a.qualified_leads ?? 0) - (b.qualified_leads ?? 0),
        render: (v: number) => (
          <Typography.Text style={{ fontSize: 13, fontWeight: 600, color: "#52c41a" }}>
            {v ?? 0}
          </Typography.Text>
        ),
      },
      {
        title: "Actions",
        key: "actions",
        width: 100,
        render: (_: unknown, r: AgentCampaignRow) => (
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => router.push(`/agent/campaigns/${r.id}`)}
          >
            View
          </Button>
        ),
      },
    ],
    [page, pageSize, router]
  );

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spin size="large" />
      </div>
    );
  }

  if (!hasRole("agent")) {
    return null;
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Campaigns
        </Typography.Title>
        <Typography.Text type="secondary">
          All campaigns assigned to you.
        </Typography.Text>
      </div>

      {isOffline && (
        <div style={{ marginBottom: 16 }}>
          <Typography.Text type="danger" style={{ fontSize: 14 }}>
            You appear to be offline. Check your internet connection. Data will
            reload automatically once you are back online, or{" "}
            <Button type="link" onClick={() => void refetch()} style={{ padding: 0 }}>
              click here to retry now
            </Button>
            .
          </Typography.Text>
        </div>
      )}

      <div
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ flex: 1, minWidth: 220, maxWidth: 320 }}>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search campaigns..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
        </div>
        <Select
          placeholder="Filter by status"
          allowClear
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "draft", label: "Draft" },
            { value: "active", label: "Active" },
            { value: "paused", label: "Paused" },
            { value: "completed", label: "Completed" },
          ]}
          style={{ width: 180 }}
        />
      </div>

      <Table
        className="table-single-line"
        columns={columns}
        dataSource={campaigns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1150 }}
        tableLayout="fixed"
        pagination={tablePagination}
        locale={{
          emptyText:
            "No campaigns assigned yet. Your Team Leader can assign you to campaigns.",
        }}
      />
    </div>
  );
}
