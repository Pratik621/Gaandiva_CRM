"use client";

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { Button, Col, Row, Spin, Typography, message } from "antd";
import { CheckCircleFilled, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

type CallLog = {
  id: string;
  call_started_at: string | null;
  call_date: string | null;
  call_sequence: number | null;
  duration_seconds: number | null;
  duration_text: string | null;
  status: string;
};

function formatDuration(log: CallLog): string | null {
  if (log.duration_seconds == null) return log.duration_text;
  const m = Math.floor(log.duration_seconds / 60);
  const s = log.duration_seconds % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

function formatWhen(log: CallLog): string {
  if (log.call_started_at) {
    const at = dayjs(log.call_started_at);
    return `${at.format("DD/MM/YYYY")} · ${at.format("hh:mm A")}`;
  }
  return log.call_date ? dayjs(log.call_date).format("DD/MM/YYYY") : "—";
}

export type AgentCallLogCardsHandle = {
  addCallLog: () => void;
};

/** Agent-only Voice Log: call cards from the separate Call Logs DB (no audio). */
export const AgentCallLogCards = forwardRef<AgentCallLogCardsHandle, { leadId: string }>(
  function AgentCallLogCards({ leadId }, ref) {
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/leads/${leadId}/call-logs`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json?.error) message.warning(`Voice Log: ${json.error}`);
        return;
      }
      setCallLogs(json?.callLogs ?? []);
    } catch (err) {
      console.error("Failed to load call logs", err);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/agent/leads/${leadId}/call-logs`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(json?.error || "Failed to add call log");
        return;
      }
      setCallLogs(json?.callLogs ?? []);
      message.success("Call logged");
    } catch {
      message.error("Failed to add call log");
    } finally {
      setAdding(false);
    }
  };

  useImperativeHandle(ref, () => ({ addCallLog: () => void handleAdd() }));

  return (
    <>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        Calls logged for this lead.
      </Typography.Text>
      <Row gutter={[12, 12]}>
        {callLogs.map((log) => {
          const duration = formatDuration(log);
          return (
            <Col key={log.id} xs={24} sm={12}>
              <div
                style={{
                  border: "1px solid #f0f0f0",
                  borderRadius: 8,
                  padding: 10,
                  background: "#fafafa",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 4,
                  minHeight: 80,
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <CheckCircleFilled style={{ color: "#16a34a" }} />
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    Call done
                  </Typography.Text>
                </span>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {formatWhen(log)}
                  {duration ? ` · ${duration}` : ""}
                </Typography.Text>
              </div>
            </Col>
          );
        })}
        <Col xs={24} sm={12}>
          <Button
            type="dashed"
            style={{ width: "100%", height: 80 }}
            icon={<PlusOutlined />}
            onClick={() => void handleAdd()}
            loading={adding}
          >
            Add call recording
          </Button>
        </Col>
      </Row>
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Spin size="small" />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Loading call logs...
          </Typography.Text>
        </div>
      )}
    </>
  );
  }
);
