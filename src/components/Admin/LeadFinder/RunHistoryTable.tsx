"use client";

import { useEffect, useState } from "react";
import { Button, Table, Tag, Typography, message } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { usePaginatedListQuery } from "@/hooks/usePaginatedListQuery";
import { estimateCostUsd, type LeadFinderRun } from "@/lib/lead-finder/types";

const { Text } = Typography;

const STATUS_COLORS: Record<string, string> = {
  RUNNING: "processing",
  IMPORTING: "processing",
  SUCCEEDED: "green",
  FAILED: "red",
  ABORTED: "orange",
};

export default function RunHistoryTable({
  refreshToken,
  onViewLeads,
  onSelectRun,
}: {
  refreshToken: number;
  onViewLeads: (batchName: string) => void;
  onSelectRun: (runId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { items, pagination, isLoading, error, refetch } =
    usePaginatedListQuery<LeadFinderRun>({
      queryKeyPrefix: ["lead-finder", "runs"],
      url: "/api/admin/lead-finder/runs",
      params: { page, limit: pageSize },
      listField: "runs",
    });

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  useEffect(() => {
    if (error) {
      message.error(error instanceof Error ? error.message : "Failed to load run history");
    }
  }, [error]);

  return (
    <Table<LeadFinderRun>
      rowKey="id"
      size="middle"
      loading={isLoading}
      dataSource={items}
      pagination={{
        current: page,
        pageSize,
        total: pagination?.total ?? 0,
        showSizeChanger: true,
        onChange: (p, ps) => {
          setPage(p);
          setPageSize(ps);
        },
      }}
      expandable={{
        expandedRowRender: (run) => (
          <pre style={{ margin: 0, fontSize: 12, maxHeight: 260, overflow: "auto" }}>
            {JSON.stringify(run.filters, null, 2)}
          </pre>
        ),
      }}
      columns={[
        {
          title: "Date",
          dataIndex: "created_at",
          width: 160,
          render: (v: string) => (
            <Text style={{ fontSize: 12 }}>{new Date(v).toLocaleString()}</Text>
          ),
        },
        {
          title: "Batch",
          dataIndex: "batch_name",
          ellipsis: true,
          render: (v: string, run) => (
            <Button type="link" style={{ padding: 0 }} onClick={() => onSelectRun(run.id)}>
              {v}
            </Button>
          ),
        },
        {
          title: "Status",
          dataIndex: "status",
          width: 120,
          render: (v: string) => <Tag color={STATUS_COLORS[v] ?? "default"}>{v}</Tag>,
        },
        {
          title: "Found",
          dataIndex: "total_found",
          width: 90,
          render: (v: number) => v.toLocaleString(),
        },
        {
          title: "New / Upd / Skip",
          width: 150,
          render: (_, r) =>
            `${r.inserted_count.toLocaleString()} / ${r.updated_count.toLocaleString()} / ${r.skipped_count.toLocaleString()}`,
        },
        {
          title: "Est. cost",
          width: 90,
          render: (_, r) => `$${estimateCostUsd(r.filters?.fetch_count ?? r.total_found)}`,
        },
        {
          title: "Started by",
          dataIndex: "started_by_name",
          width: 140,
          ellipsis: true,
          render: (v: string | null) => v ?? "—",
        },
        {
          title: "",
          width: 120,
          render: (_, r) => (
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => onViewLeads(r.batch_name)}
            >
              View Leads
            </Button>
          ),
        },
      ]}
    />
  );
}
