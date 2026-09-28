"use client";

import { Button, Table, Typography, Spin, Tag } from "antd";
import { HistoryOutlined } from "@ant-design/icons";
import { usePaginatedListQuery } from "@/hooks/usePaginatedListQuery";
import {
  serverTableInitialLoading,
  useServerTablePagination,
  useSyncListPaginationTotal,
} from "@/hooks/useServerTablePagination";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type TransferHistoryItem = {
  id: string;
  lead_count: number;
  campaign_name: string;
  from_agent_name: string;
  to_agent_name: string;
  tl_name: string;
  transferred_at: string;
  notes: string | null;
  transfer_mode: string;
};

export default function LeadTransferHistoryPage() {
  const router = useRouter();
  const { hasRole, isInitialized } = useAuth();
  const isTL = hasRole("team_leader") || hasRole("tl");
  const { page, pageSize, applyPaginationMeta, tablePagination } = useServerTablePagination();

  const { items, pagination: apiPagination, isLoading, error, refetch } =
    usePaginatedListQuery<TransferHistoryItem>({
      queryKeyPrefix: ["tl", "lead-transfer-history"],
      url: "/api/tl/leads/transfer/history",
      params: { page, limit: pageSize },
      listField: "items",
      enabled: isTL && isInitialized,
    });

  useSyncListPaginationTotal(apiPagination, applyPaginationMeta);

  useEffect(() => {
    if (!isInitialized) return;
    if (!isTL) {
      router.replace("/tl/dashboard");
    }
  }, [isInitialized, isTL, router]);

  if (!isInitialized || !isTL) {
    return (
      <div className="min-h-[200px] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  const columns = [
    {
      title: "Date",
      dataIndex: "transferred_at",
      key: "transferred_at",
      width: 170,
      render: (val: string) =>
        val ? new Date(val).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—",
    },
    {
      title: "TL Name",
      dataIndex: "tl_name",
      key: "tl_name",
    },
    {
      title: "From Agent",
      dataIndex: "from_agent_name",
      key: "from_agent_name",
    },
    {
      title: "To Agent",
      dataIndex: "to_agent_name",
      key: "to_agent_name",
    },
    {
      title: "Campaign",
      dataIndex: "campaign_name",
      key: "campaign_name",
    },
    {
      title: "Leads",
      dataIndex: "lead_count",
      key: "lead_count",
      width: 80,
      render: (val: number) => <Tag color="blue">{val}</Tag>,
    },
    {
      title: "Mode",
      dataIndex: "transfer_mode",
      key: "transfer_mode",
      width: 100,
      render: (val: string) => {
        const labels: Record<string, string> = {
          all: "All",
          campaign: "Campaign",
          selected: "Selected",
        };
        return labels[val] ?? val;
      },
    },
    {
      title: "Notes",
      dataIndex: "notes",
      key: "notes",
      ellipsis: true,
      render: (val: string | null) => val || "—",
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Lead Transfer History
          </Typography.Title>
          <Typography.Text type="secondary">
            Audit log of leads transferred from inactive agents to active agents.
          </Typography.Text>
        </div>
        <Button icon={<HistoryOutlined />} onClick={() => void refetch()}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
          {error instanceof Error ? error.message : "Failed to load history"}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <Table
          className="table-single-line"
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={serverTableInitialLoading(isLoading, items.length)}
          locale={{ emptyText: "No transfer history yet" }}
          pagination={tablePagination}
        />
      </div>
    </>
  );
}
