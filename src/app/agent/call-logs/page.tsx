"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Select, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined, CheckCircleFilled, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useAuth } from "@/context/AuthContext";

type CallLogRow = {
  id: string;
  lead_id: string;
  campaign_id: string | null;
  call_started_at: string | null;
  call_date: string | null;
  duration_seconds: number | null;
  duration_text: string | null;
  lead_code: string | null;
  lead_name: string | null;
  company_name: string | null;
  email: string | null;
  campaign_name: string | null;
};

type CampaignOption = { id: string; name: string };

function formatDuration(row: CallLogRow): string {
  if (row.duration_seconds == null) return row.duration_text || "—";
  const m = Math.floor(row.duration_seconds / 60);
  const s = row.duration_seconds % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

function formatDate(row: CallLogRow): string {
  if (row.call_started_at) return dayjs(row.call_started_at).format("DD/MM/YYYY");
  return row.call_date ? dayjs(row.call_date).format("DD/MM/YYYY") : "—";
}

export default function AgentCallLogsPage() {
  const { hasRole, isInitialized } = useAuth();
  const [rows, setRows] = useState<CallLogRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const isAgent = isInitialized && hasRole("agent");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (campaignId) params.set("campaign_id", campaignId);
      if (debouncedSearch) params.set("q", debouncedSearch);
      const res = await fetch(`/api/agent/call-logs?${params.toString()}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(json?.error || "Failed to load call logs");
        return;
      }
      setRows(json?.callLogs ?? []);
      setCampaigns(json?.campaigns ?? []);
      setTotal(json?.pagination?.total ?? 0);
    } catch {
      message.error("Failed to load call logs");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, campaignId, debouncedSearch]);

  useEffect(() => {
    if (isAgent) void load();
  }, [isAgent, load]);

  if (!isAgent) {
    return null;
  }

  const columns: ColumnsType<CallLogRow> = [
    {
      title: "Sr. No.",
      key: "sr",
      width: 80,
      render: (_v, _r, i) => (page - 1) * pageSize + i + 1,
    },
    { title: "Lead ID", dataIndex: "lead_code", key: "lead_code", render: (v) => v || "—" },
    { title: "Name", dataIndex: "lead_name", key: "lead_name", render: (v) => v || "—" },
    { title: "Company", dataIndex: "company_name", key: "company_name", render: (v) => v || "—" },
    { title: "Campaign", dataIndex: "campaign_name", key: "campaign_name", render: (v) => v || "—" },
    { title: "Call Date", key: "call_date", width: 130, render: (_v, r) => formatDate(r) },
    { title: "Duration", key: "duration", width: 120, render: (_v, r) => formatDuration(r) },
    {
      title: "Status",
      key: "status",
      width: 130,
      render: () => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <CheckCircleFilled style={{ color: "#16a34a" }} /> Call done
        </span>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-[1600px] mx-auto">
        <div style={{ marginBottom: 24 }}>
          <Link
            href="/agent/dashboard"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "#4f46e5", textDecoration: "none", marginBottom: 16 }}
          >
            <ArrowLeftOutlined /> Back to Dashboard
          </Link>
          <Typography.Title level={3} style={{ margin: 0, fontWeight: 600 }}>
            Call Logs
          </Typography.Title>
          <Typography.Text type="secondary">
            All calls you have logged across your leads.
          </Typography.Text>
        </div>

        <Card
          title={`Call Logs (${total})`}
          extra={
            <Space>
              <Typography.Text type="secondary">Campaign:</Typography.Text>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="All campaigns"
                style={{ minWidth: 240 }}
                value={campaignId ?? undefined}
                onChange={(value) => {
                  setCampaignId(value ?? null);
                  setPage(1);
                }}
                options={campaigns.map((c) => ({ value: c.id, label: c.name }))}
              />
              <Button onClick={() => void load()} loading={loading}>
                Refresh
              </Button>
            </Space>
          }
        >
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
            placeholder="Search by name, company, email or Lead ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 420, marginBottom: 16 }}
          />
          <Table<CallLogRow>
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={loading}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: "No call logs yet" }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: ["10", "25", "50", "100"],
              showTotal: (t) => `${t} calls`,
              onChange: (p, ps) => {
                setPage(ps !== pageSize ? 1 : p);
                setPageSize(ps);
              },
            }}
          />
        </Card>
      </div>
    </div>
  );
}
