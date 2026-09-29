"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card, Input, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined, CheckCircleOutlined, SearchOutlined, StopOutlined } from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";

type LeadRow = {
  id: string;
  lead_id: string | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  job_title: string | null;
  qa_status: string | null;
};

type LeadState = "active" | "inactive";

const PAGE_LIMIT = 100;

function leadName(r: LeadRow): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.name || "—";
}

function matches(r: LeadRow, q: string): boolean {
  if (!q) return true;
  const hay = [r.lead_id, leadName(r), r.company_name, r.email, r.job_title].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

/** Agent: activate / deactivate leads. Only active leads show in the campaign Leads table. */
export default function AgentLeadActivationPage() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const { hasRole, isInitialized } = useAuth();

  const [active, setActive] = useState<LeadRow[]>([]);
  const [inactive, setInactive] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<LeadState | null>(null);
  const [selectedActive, setSelectedActive] = useState<React.Key[]>([]);
  const [selectedInactive, setSelectedInactive] = useState<React.Key[]>([]);
  const [search, setSearch] = useState("");

  const fetchState = useCallback(
    async (state: LeadState): Promise<LeadRow[]> => {
      const all: LeadRow[] = [];
      for (let page = 1; ; page++) {
        const res = await fetch(
          `/api/agent/campaigns/${id}/leads?state=${state}&page=${page}&limit=${PAGE_LIMIT}`,
          { credentials: "include" }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load leads");
        const rows = (json?.leads ?? []) as LeadRow[];
        all.push(...rows);
        const totalPages = json?.pagination?.totalPages ?? 1;
        if (page >= totalPages || rows.length === 0) break;
      }
      return all;
    },
    [id]
  );

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [a, i] = await Promise.all([fetchState("active"), fetchState("inactive")]);
      setActive(a);
      setInactive(i);
      setSelectedActive([]);
      setSelectedInactive([]);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [id, fetchState]);

  useEffect(() => {
    if (isInitialized && hasRole("agent")) void load();
  }, [isInitialized, hasRole, load]);

  const setLeadsActive = async (ids: React.Key[], makeActive: boolean) => {
    if (!id || ids.length === 0) return;
    setSaving(makeActive ? "inactive" : "active");
    try {
      const res = await fetch(`/api/agent/campaigns/${id}/leads/activation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids, active: makeActive }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to update leads");
      message.success(
        `${json.updated ?? ids.length} lead${ids.length === 1 ? "" : "s"} ${makeActive ? "activated" : "deactivated"}`
      );
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to update leads");
    } finally {
      setSaving(null);
    }
  };

  const columns: ColumnsType<LeadRow> = useMemo(
    () => [
      { title: "Lead ID", dataIndex: "lead_id", key: "lead_id", render: (v) => v || "—" },
      { title: "Name", key: "name", render: (_v, r) => leadName(r) },
      { title: "Company", dataIndex: "company_name", key: "company_name", render: (v) => v || "—" },
      { title: "Email", dataIndex: "email", key: "email", render: (v) => v || "—" },
      { title: "Job Title", dataIndex: "job_title", key: "job_title", ellipsis: true, render: (v) => v || "—" },
      {
        title: "QA Status",
        dataIndex: "qa_status",
        key: "qa_status",
        render: (v: string | null) =>
          v ? <Tag color={v === "qualified" ? "green" : v === "disqualified" ? "red" : "default"}>{v}</Tag> : "—",
      },
    ],
    []
  );

  if (!isInitialized || !hasRole("agent")) return null;

  const filteredActive = active.filter((r) => matches(r, search.trim()));
  const filteredInactive = inactive.filter((r) => matches(r, search.trim()));

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-[1600px] mx-auto">
        <div style={{ marginBottom: 24 }}>
          <Link
            href={`/agent/campaigns/${id}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "#4f46e5", textDecoration: "none", marginBottom: 16 }}
          >
            <ArrowLeftOutlined /> Back to Campaign
          </Link>
          <Typography.Title level={3} style={{ margin: 0, fontWeight: 600 }}>
            Lead Activation
          </Typography.Title>
          <Typography.Text type="secondary">
            Select one or more leads to activate or deactivate. Only activated leads appear in the campaign Leads table.
          </Typography.Text>
        </div>

        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
          placeholder="Search by name, company, email or Lead ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 420, marginBottom: 16 }}
        />

        <Card
          title={`Activated leads (${active.length})`}
          style={{ marginBottom: 24 }}
          extra={
            <Button
              danger
              icon={<StopOutlined />}
              disabled={selectedActive.length === 0}
              loading={saving === "active"}
              onClick={() => void setLeadsActive(selectedActive, false)}
            >
              Deactivate selected{selectedActive.length ? ` (${selectedActive.length})` : ""}
            </Button>
          }
        >
          <Table<LeadRow>
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={filteredActive}
            loading={loading}
            rowSelection={{ selectedRowKeys: selectedActive, onChange: setSelectedActive }}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} leads` }}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: "No activated leads" }}
          />
        </Card>

        <Card
          title={`Deactivated leads (${inactive.length})`}
          extra={
            <Space>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                disabled={selectedInactive.length === 0}
                loading={saving === "inactive"}
                onClick={() => void setLeadsActive(selectedInactive, true)}
              >
                Activate selected{selectedInactive.length ? ` (${selectedInactive.length})` : ""}
              </Button>
            </Space>
          }
        >
          <Table<LeadRow>
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={filteredInactive}
            loading={loading}
            rowSelection={{ selectedRowKeys: selectedInactive, onChange: setSelectedInactive }}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} leads` }}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: "No deactivated leads" }}
          />
        </Card>
      </div>
    </div>
  );
}
