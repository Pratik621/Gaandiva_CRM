"use client";

import React, { useEffect, useState } from "react";
import { Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

type CallLogRow = {
  id: string;
  call_sequence: number | null;
  call_date: string | null;
  call_started_at: string | null;
  duration_seconds: number | null;
  duration_text: string | null;
  caller_name?: string | null;
  did_number?: string | null;
  disposition?: string | null;
  system_id?: string | null;
};

function formatDuration(row: CallLogRow): string {
  if (row.duration_seconds == null) return row.duration_text || "—";
  const m = Math.floor(row.duration_seconds / 60);
  const s = row.duration_seconds % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

function formatDate(row: CallLogRow): string {
  if (row.call_started_at) return dayjs(row.call_started_at).format("DD/MM/YYYY hh:mm A");
  return row.call_date ? dayjs(row.call_date).format("DD/MM/YYYY") : "—";
}

/** Agent-only lead drawer section: per-call details from the Call Logs DB. */
export function AgentCallLogDetails({ leadId }: { leadId: string }) {
  const [rows, setRows] = useState<CallLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/agent/leads/${leadId}/call-logs`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { callLogs: [] }))
      .then((json) => {
        if (cancelled) return;
        const list = ((json?.callLogs ?? []) as CallLogRow[]).slice();
        // Same order as the call sheet: Call 1, Call 2, ... (call number), then
        // calls without a number (added in the app) by time.
        list.sort(
          (a, b) =>
            (a.call_sequence ?? Number.MAX_SAFE_INTEGER) - (b.call_sequence ?? Number.MAX_SAFE_INTEGER) ||
            (a.call_started_at ?? a.call_date ?? "").localeCompare(b.call_started_at ?? b.call_date ?? "")
        );
        setRows(list);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const columns: ColumnsType<CallLogRow> = [
    { title: "#", key: "n", width: 44, render: (_v, _r, i) => i + 1 },
    { title: "System ID", dataIndex: "system_id", key: "system_id", render: (v) => v || "—" },
    { title: "Agent Name", dataIndex: "caller_name", key: "caller_name", render: (v) => v || "—" },
    { title: "DID Number", dataIndex: "did_number", key: "did_number", render: (v) => v || "—" },
    { title: "Call Date", key: "call_date", render: (_v, r) => formatDate(r) },
    { title: "Duration", key: "duration", render: (_v, r) => formatDuration(r) },
    {
      title: "Disposition",
      dataIndex: "disposition",
      key: "disposition",
      render: (v: string | null | undefined) =>
        v ? (
          <Tag color={v.toLowerCase() === "scored" ? "green" : "default"} style={{ marginInlineEnd: 0 }}>
            {v}
          </Tag>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        Call log count: {rows.length}
      </Typography.Text>
      <Table<CallLogRow>
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: "No calls logged yet" }}
      />
    </div>
  );
}
