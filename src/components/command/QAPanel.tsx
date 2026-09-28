"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Button,
  DatePicker,
  Space,
  Typography,
  Empty,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  Bar,
  Line,
} from "recharts";
import { ReloadOutlined, LinkOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { statusLabel } from "@/lib/command/state-machine";

const { Text } = Typography;
const { RangePicker } = DatePicker;

type QaApiResponse = {
  rangeStart: string;
  rangeEnd: string;
  summary: {
    totalReviewed: number;
    passCount: number;
    failCount: number;
    passRatePct: number | null;
    failRatePct: number | null;
    avgMsIngestToQaComplete: number | null;
    reauditLeadCount: number;
  };
  trend: {
    date: string;
    volume: number;
    passCount: number;
    failCount: number;
    passRatePct: number | null;
    failRatePct: number | null;
  }[];
  dqReasons: { code: string; count: number }[];
  reauditLog: {
    lead_id: string;
    original_result: "qualified" | "disqualified";
    reaudit_result: "qualified" | "disqualified";
    performed_by: string | null;
    performed_by_label: string | null;
    performed_at: string;
    reason: string | null;
  }[];
  error?: string;
};

function formatAvgMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const hours = ms / 3_600_000;
  if (hours < 72) return `${Math.round(hours * 10) / 10} h`;
  const days = hours / 24;
  return `${Math.round(days * 10) / 10} d`;
}

interface QAPanelProps {
  campaignId: string;
  onOpenLeadAudit?: (leadId: string) => void;
}

function formatUtcMinute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Puts the hint above the large value (inside Statistic title) so copy is not stacked under the number. */
function QaMetricStatistic(props: {
  label: ReactNode;
  hint: string;
  value: string | number;
  suffix?: string;
  labelNoWrap?: boolean;
}) {
  const { label, hint, value, suffix, labelNoWrap } = props;
  return (
    <Statistic
      title={
        <div>
          <div
            style={
              labelNoWrap
                ? {
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }
                : { lineHeight: 1.35 }
            }
          >
            {label}
          </div>
          <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4, lineHeight: 1.35 }}>
            {hint}
          </Text>
        </div>
      }
      value={value}
      suffix={suffix}
    />
  );
}

export default function QAPanel({ campaignId, onOpenLeadAudit }: QAPanelProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<QaApiResponse | null>(null);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (dateRange) {
        sp.set("date_from", dateRange[0].format("YYYY-MM-DD"));
        sp.set("date_to", dateRange[1].format("YYYY-MM-DD"));
      }
      const qs = sp.toString();
      const res = await fetch(
        `/api/command/campaigns/${campaignId}/qa${qs ? `?${qs}` : ""}`,
        { credentials: "include" }
      );
      const json = (await res.json()) as QaApiResponse;
      if (!res.ok) throw new Error(json.error ?? "Failed to load QA analytics");
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId, dateRange]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(() => {
    if (!data?.trend?.length) return [];
    return data.trend.map((r) => ({
      ...r,
      dateShort: dayjs(r.date).format("MMM D"),
    }));
  }, [data?.trend]);

  const dqChartData = useMemo(() => {
    if (!data?.dqReasons?.length) return [];
    return [...data.dqReasons]
      .slice(0, 12)
      .map((r) => ({ name: r.code.length > 40 ? `${r.code.slice(0, 40)}…` : r.code, count: r.count, full: r.code }))
      .reverse();
  }, [data?.dqReasons]);

  const reauditColumns: ColumnsType<QaApiResponse["reauditLog"][number]> = [
    {
      title: "Lead ID",
      dataIndex: "lead_id",
      key: "lead_id",
      width: 110,
      render: (id: string) =>
        onOpenLeadAudit ? (
          <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => onOpenLeadAudit(id)}>
            {id.slice(0, 8)}…
          </Button>
        ) : (
          <Text code style={{ fontSize: 12 }}>
            {id.slice(0, 8)}…
          </Text>
        ),
    },
    {
      title: "Original QA result",
      dataIndex: "original_result",
      key: "orig",
      render: (v: string) => statusLabel(v),
    },
    {
      title: "Re-audit result",
      dataIndex: "reaudit_result",
      key: "re",
      render: (v: string) => statusLabel(v),
    },
    {
      title: "Performed by",
      key: "by",
      ellipsis: true,
      render: (_, r) => r.performed_by_label ?? "—",
    },
    {
      title: "Timestamp (UTC)",
      dataIndex: "performed_at",
      key: "at",
      width: 200,
      render: (iso: string) => (
        <Tooltip title={new Date(iso).toISOString()}>
          <span>{formatUtcMinute(iso)}</span>
        </Tooltip>
      ),
    },
    {
      title: "Re-audit reason",
      dataIndex: "reason",
      key: "reason",
      ellipsis: true,
      render: (t: string | null) => t?.trim() || "—",
    },
  ];

  const s = data?.summary;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <RangePicker
          value={dateRange}
          onChange={(v) => {
            if (v?.[0] && v?.[1]) setDateRange([v[0], v[1]]);
            else setDateRange(null);
          }}
          allowClear
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          Refresh
        </Button>
        {data?.rangeStart && data?.rangeEnd && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Trend range: {data.rangeStart} → {data.rangeEnd}
          </Text>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        <Card
          size="small"
          loading={loading}
          styles={{ body: { padding: "12px 16px" } }}
          style={{ flex: "1 1 220px", minWidth: 220 }}
        >
          <QaMetricStatistic
            label="Total reviewed"
            hint="Exited QA Pending"
            value={s?.totalReviewed ?? 0}
          />
        </Card>
        <Card
          size="small"
          loading={loading}
          styles={{ body: { padding: "12px 16px" } }}
          style={{ flex: "1 1 220px", minWidth: 220 }}
        >
          <QaMetricStatistic
            label="QA pass rate"
            hint="Qualified ÷ reviewed"
            value={s?.passRatePct ?? "—"}
            suffix={s?.passRatePct != null ? "%" : undefined}
          />
        </Card>
        <Card
          size="small"
          loading={loading}
          styles={{ body: { padding: "12px 16px" } }}
          style={{ flex: "1 1 220px", minWidth: 220 }}
        >
          <QaMetricStatistic
            label="QA fail rate"
            hint="Disqualified ÷ reviewed"
            value={s?.failRatePct ?? "—"}
            suffix={s?.failRatePct != null ? "%" : undefined}
          />
        </Card>
        <Card
          size="small"
          loading={loading}
          styles={{ body: { padding: "12px 16px" } }}
          style={{ flex: "1 1 240px", minWidth: 240 }}
        >
          <QaMetricStatistic
            label="Avg. ingest → QA done"
            hint="Mean completion time"
            value={formatAvgMs(s?.avgMsIngestToQaComplete)}
            labelNoWrap
          />
        </Card>
        <Card
          size="small"
          loading={loading}
          styles={{ body: { padding: "12px 16px" } }}
          style={{ flex: "1 1 220px", minWidth: 220 }}
        >
          <QaMetricStatistic
            label="Re-audit leads"
            hint="2+ QA completions"
            value={s?.reauditLeadCount ?? 0}
          />
        </Card>
      </div>

      <Card size="small" title="QA trend (daily)" loading={loading}>
        {chartData.length === 0 ? (
          <Empty description="No QA completion events in this range (needs lead history)" />
        ) : (
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateShort" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <RTooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="volume" name="Volume (completions)" fill="#4f46e5" opacity={0.85} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="passRatePct"
                  name="Pass rate %"
                  stroke="#52c41a"
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="failRatePct"
                  name="Fail rate %"
                  stroke="#ef4444"
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card size="small" title="DQ reason codes (current disqualified leads)" loading={loading}>
            {dqChartData.length === 0 ? (
              <Empty description="No disqualified leads or reason codes" />
            ) : (
              <div style={{ width: "100%", height: Math.min(420, 40 + dqChartData.length * 36) }}>
                <ResponsiveContainer>
                  <ComposedChart
                    layout="vertical"
                    data={dqChartData}
                    margin={{ left: 8, right: 24, top: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 11 }} />
                    <RTooltip
                      formatter={(value: number) => [value, "Leads"]}
                      labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ""}
                    />
                    <Bar dataKey="count" name="Leads" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title="DQ reasons (table)" loading={loading}>
            <Table
              size="small"
              pagination={false}
              rowKey={(r) => r.code}
              dataSource={data?.dqReasons ?? []}
              columns={[
                { title: "Reason code", dataIndex: "code", key: "code", ellipsis: true },
                { title: "Count", dataIndex: "count", key: "c", width: 80 },
              ]}
              locale={{ emptyText: "No data" }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title="Re-audit log"
        loading={loading}
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            Rows appear when a lead completes QA more than once (returns to QA Pending between reviews).
          </Text>
        }
      >
        <Table
          rowKey={(r) => `${r.lead_id}-${r.performed_at}`}
          size="small"
          dataSource={data?.reauditLog ?? []}
          columns={reauditColumns}
          pagination={{ pageSize: 8 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No re-audits recorded for this campaign"
              />
            ),
          }}
        />
      </Card>

    </Space>
  );
}
