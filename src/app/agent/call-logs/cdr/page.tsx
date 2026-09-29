"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { Alert, Button, Card, DatePicker, Input, Modal, Progress, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { ArrowLeftOutlined, DownloadOutlined, SearchOutlined, UploadOutlined } from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import {
  CDR_COLUMNS,
  CDR_EXPORT_PAGE_SIZE,
  CDR_IMPORT_BATCH_SIZE,
  mapCdrHeaderRow,
  normalizeCdrDate,
  type CdrKey,
} from "@/lib/cdr";

type CdrRecord = { id: string } & Partial<Record<CdrKey, string | number | null>>;

type ImportState = {
  fileName: string;
  total: number;
  sent: number;
  inserted: number;
  duplicates: number;
  skipped: number;
  failedBatches: number;
  errors: string[];
  done: boolean;
};

const DATE_HEADERS = new Set(["calldate", "calldate_us_eastern"]);
const normHeader = (h: unknown) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Parse an Excel / CSV CDR export into row objects keyed by cdr_records column.
 * Finds the header row (first row with "uniqueid" or "calldate" in the top 20).
 * Date cells use the real date value; other cells use the text shown in Excel so
 * long ids / phone numbers are not rounded.
 */
function parseCdrFile(buffer: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const textRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null });

  const headerIdx = rawRows
    .slice(0, 20)
    .findIndex((r) => (r ?? []).some((c) => ["uniqueid", "calldate"].includes(normHeader(c))));
  if (headerIdx < 0) throw new Error("Header row not found (expected columns like calldate, uniqueid)");
  const headers = (rawRows[headerIdx] ?? []).map((h) => String(h ?? "").trim());

  const out: Record<string, unknown>[] = [];
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const raw = rawRows[i] ?? [];
    const text = textRows[i] ?? [];
    const obj: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((h, col) => {
      if (!h) return;
      const r = raw[col];
      const t = text[col];
      let v: unknown;
      if (DATE_HEADERS.has(normHeader(h))) v = normalizeCdrDate(r ?? t);
      else if (typeof r === "number" && typeof t === "string" && /e\+/i.test(t)) v = String(r);
      else v = t ?? r;
      if (v != null && String(v).trim() !== "") hasValue = true;
      obj[h] = v;
    });
    if (hasValue) out.push(mapCdrHeaderRow(obj));
  }
  return out;
}

function formatSeconds(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  const m = Math.floor(n / 60);
  const s = n % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

/** Agent: import / browse / export raw dialer CDR call logs (Call Logs DB). */
export default function AgentCdrCallLogsPage() {
  const { hasRole, isInitialized } = useAuth();
  const isAgent = isInitialized && hasRole("agent");

  const [rows, setRows] = useState<CdrRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const buildQuery = useCallback(
    (p: number, limit: number) => {
      const qs = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (debouncedSearch) qs.set("q", debouncedSearch);
      if (range?.[0]) qs.set("from", range[0].format("YYYY-MM-DD"));
      if (range?.[1]) qs.set("to", range[1].format("YYYY-MM-DD"));
      return `/api/agent/call-logs/cdr?${qs.toString()}`;
    },
    [debouncedSearch, range]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(buildQuery(page, pageSize), { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(json?.error || "Failed to load call logs");
        return;
      }
      setRows(json?.records ?? []);
      setTotal(json?.pagination?.total ?? 0);
    } catch {
      message.error("Failed to load call logs");
    } finally {
      setLoading(false);
    }
  }, [buildQuery, page, pageSize]);

  useEffect(() => {
    if (isAgent) void load();
  }, [isAgent, load]);

  const handleFile = async (file: File) => {
    let parsed: Record<string, unknown>[];
    try {
      parsed = parseCdrFile(await file.arrayBuffer());
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not read the file");
      return;
    }
    if (parsed.length === 0) {
      message.warning("No call log rows found in the file");
      return;
    }

    const batchId = crypto.randomUUID();
    const state: ImportState = {
      fileName: file.name,
      total: parsed.length,
      sent: 0,
      inserted: 0,
      duplicates: 0,
      skipped: 0,
      failedBatches: 0,
      errors: [],
      done: false,
    };
    setImportState({ ...state });

    for (let i = 0; i < parsed.length; i += CDR_IMPORT_BATCH_SIZE) {
      const chunk = parsed.slice(i, i + CDR_IMPORT_BATCH_SIZE);
      try {
        const res = await fetch("/api/agent/call-logs/cdr/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ rows: chunk, batchId }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `Batch failed (${res.status})`);
        state.inserted += json.inserted ?? 0;
        state.duplicates += json.duplicates ?? 0;
        state.skipped += json.skipped_empty ?? 0;
      } catch (err) {
        state.failedBatches += 1;
        const msg = err instanceof Error ? err.message : "Batch failed";
        state.errors.push(`Rows ${i + 1}–${i + chunk.length}: ${msg}`);
        // Stop early when every call fails the same way (e.g. table missing).
        if (state.failedBatches >= 3 && state.inserted === 0) break;
      }
      state.sent = Math.min(i + chunk.length, parsed.length);
      setImportState({ ...state });
    }

    state.done = true;
    setImportState({ ...state });
    setPage(1);
    void load();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const all: CdrRecord[] = [];
      for (let p = 1; ; p++) {
        const res = await fetch(buildQuery(p, CDR_EXPORT_PAGE_SIZE), { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to export");
        const batch = (json?.records ?? []) as CdrRecord[];
        all.push(...batch);
        const totalPages = json?.pagination?.totalPages ?? 1;
        if (p >= totalPages || batch.length === 0) break;
      }
      if (all.length === 0) {
        message.warning("No call logs to export");
        return;
      }
      const sheetRows = all.map((r) => {
        const o: Record<string, unknown> = {};
        for (const { header, key } of CDR_COLUMNS) o[header] = r[key] ?? "";
        return o;
      });
      const ws = XLSX.utils.json_to_sheet(sheetRows, { header: CDR_COLUMNS.map((c) => c.header) });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Call Logs");
      XLSX.writeFile(wb, `call-logs-cdr-${new Date().toISOString().slice(0, 10)}.xlsx`);
      message.success(`Exported ${all.length} call logs`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to export");
    } finally {
      setExporting(false);
    }
  };

  if (!isAgent) return null;

  const columns: ColumnsType<CdrRecord> = [
    {
      title: "Sr. No.",
      key: "sr",
      width: 80,
      fixed: "left",
      render: (_v, _r, i) => (page - 1) * pageSize + i + 1,
    },
    ...CDR_COLUMNS.map(({ header, key }) => ({
      title: header,
      dataIndex: key,
      key,
      ellipsis: true,
      width: key === "calldate" || key === "calldate_us_eastern" ? 180 : key === "lastdata" || key === "channel" || key === "dstchannel" || key === "recordingfile" ? 220 : 140,
      render: (v: unknown) =>
        v == null || v === ""
          ? "—"
          : key === "duration" || key === "billsec"
            ? formatSeconds(v)
            : String(v),
    })),
  ];

  const importing = importState != null && !importState.done;
  const percent = importState ? Math.round((importState.sent / importState.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-[1600px] mx-auto">
        <div style={{ marginBottom: 24 }}>
          <Link
            href="/agent/call-logs"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "#4f46e5", textDecoration: "none", marginBottom: 16 }}
          >
            <ArrowLeftOutlined /> Back to Call Logs
          </Link>
          <Typography.Title level={3} style={{ margin: 0, fontWeight: 600 }}>
            Dialer Call Logs (CDR)
          </Typography.Title>
          <Typography.Text type="secondary">
            Import the dialer CDR export (Excel or CSV, 10,000+ rows supported). Re-importing the same file skips rows already imported.
          </Typography.Text>
        </div>

        <Card
          title={`Call Logs (${total})`}
          extra={
            <Space wrap>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void handleFile(f);
                }}
              />
              <Button
                type="primary"
                icon={<UploadOutlined />}
                loading={importing}
                onClick={() => fileInputRef.current?.click()}
              >
                Import
              </Button>
              <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void handleExport()} disabled={total === 0}>
                Export
              </Button>
            </Space>
          }
        >
          <Space wrap style={{ marginBottom: 16 }}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Search src, dst, DID, caller name, disposition, uniqueid"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 420, maxWidth: "100%" }}
            />
            <DatePicker.RangePicker
              value={range}
              onChange={(v) => {
                setRange(v as [Dayjs | null, Dayjs | null] | null);
                setPage(1);
              }}
              placeholder={["Call date from", "Call date to"]}
            />
          </Space>

          <Table<CdrRecord>
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={rows}
            loading={loading}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: "No call logs yet — use Import to upload the dialer CDR file" }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: ["25", "50", "100"],
              showTotal: (t) => `${t} calls`,
              onChange: (p, ps) => {
                setPage(ps !== pageSize ? 1 : p);
                setPageSize(ps);
              },
            }}
          />
        </Card>
      </div>

      <Modal
        open={importState != null}
        title="Import call logs"
        closable={!importing}
        maskClosable={!importing}
        onCancel={() => setImportState(null)}
        footer={
          <Button type="primary" disabled={importing} onClick={() => setImportState(null)}>
            {importing ? "Importing…" : "Close"}
          </Button>
        }
      >
        {importState && (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Typography.Text>
              {importState.fileName} — {importState.sent.toLocaleString()} / {importState.total.toLocaleString()} rows
            </Typography.Text>
            <Progress percent={percent} status={importState.done ? (importState.failedBatches ? "exception" : "success") : "active"} />
            <Typography.Text>
              Imported: <b>{importState.inserted.toLocaleString()}</b> · Already imported (skipped):{" "}
              <b>{importState.duplicates.toLocaleString()}</b>
              {importState.skipped ? <> · Empty rows: <b>{importState.skipped}</b></> : null}
            </Typography.Text>
            {importState.errors.length > 0 && (
              <Alert
                type="error"
                showIcon
                message={`${importState.failedBatches} batch${importState.failedBatches === 1 ? "" : "es"} failed`}
                description={importState.errors.slice(0, 5).join("\n")}
                style={{ whiteSpace: "pre-line" }}
              />
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}
