"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { Dayjs } from "dayjs";
import {
  DownloadOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SoundOutlined,
  UserOutlined,
  FileZipOutlined,
} from "@ant-design/icons";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { ensureRecordingDownloadFilename } from "@/lib/qa/recording-filename";

const { Title, Text } = Typography;

type Campaign = {
  id: string;
  campaign_id?: string | null;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

type RecordingEntry = {
  path: string;
  url: string | null;
  display_name: string;
  original_name: string;
  size: number | null;
  created_at: string | null;
};

type LeadWithRecordings = {
  id: string;
  lead_id: string | null;
  name: string | null;
  email: string | null;
  agent_name: string | null;
  recordings: RecordingEntry[];
};

type CampaignRecordings = {
  campaign: { id: string; name: string };
  leads: LeadWithRecordings[];
};

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const statusColor: Record<string, string> = {
  active: "green",
  completed: "success",
  paused: "orange",
  draft: "default",
};

function AudioPlayer({ rec }: { rec: RecordingEntry }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      a.play().catch(() => {
        message.error("Could not play audio. Try downloading it.");
      });
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  if (!rec.url) {
    return (
      <Text type="secondary" style={{ fontSize: 12 }}>
        No preview available
      </Text>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
      <audio
        ref={audioRef}
        src={rec.url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
        preload="metadata"
      />
      <Button
        type="text"
        icon={playing ? <PauseCircleOutlined style={{ fontSize: 28, color: "#722ed1" }} /> : <PlayCircleOutlined style={{ fontSize: 28, color: "#722ed1" }} />}
        onClick={togglePlay}
        style={{ padding: 0, height: "auto", lineHeight: 1 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            height: 4,
            background: "#f0f0f0",
            borderRadius: 2,
            cursor: "pointer",
            position: "relative",
          }}
          onClick={(e) => {
            const a = audioRef.current;
            if (!a || !duration) return;
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            a.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
          }}
        >
          <div
            style={{
              height: "100%",
              background: "#722ed1",
              borderRadius: 2,
              width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%",
              transition: "width 0.2s linear",
            }}
          />
        </div>
        <Text type="secondary" style={{ fontSize: 11, marginTop: 2, display: "block" }}>
          {formatTime(currentTime)} {duration > 0 ? `/ ${formatTime(duration)}` : ""}
        </Text>
      </div>
    </div>
  );
}

function RecordingCard({ rec }: { rec: RecordingEntry }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!rec.url || downloading) return;
    setDownloading(true);
    try {
      const resp = await fetch(rec.url);
      if (!resp.ok) throw new Error("Download failed");
      const blob = await resp.blob();
      const filename = ensureRecordingDownloadFilename(rec.display_name, rec.original_name);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      message.error("Could not download recording");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      style={{
        border: "1px solid #ede9fe",
        borderRadius: 12,
        padding: "14px 16px",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: "0 1px 4px rgba(114,46,209,0.07)",
        height: "100%",
        minWidth: 0,
      }}
    >
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "#f3e8ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <SoundOutlined style={{ color: "#722ed1", fontSize: 13 }} />
            </div>
            <Text
              strong
              style={{
                fontSize: 12,
                lineHeight: 1.3,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                wordBreak: "break-all",
              }}
            >
              {rec.display_name}
            </Text>
          </div>
          <Text type="secondary" style={{ fontSize: 11, paddingLeft: 34 }}>
            {formatDate(rec.created_at)}
            {rec.size ? ` · ${formatFileSize(rec.size)}` : ""}
          </Text>
        </div>
        {rec.url && (
          <Tooltip title="Download">
            <Button
              type="text"
              size="small"
              loading={downloading}
              icon={<DownloadOutlined style={{ color: "#722ed1" }} />}
              onClick={handleDownload}
              style={{ flexShrink: 0, marginTop: 2 }}
            />
          </Tooltip>
        )}
      </div>

      {/* Audio player */}
      <div
        style={{
          background: "#f9f5ff",
          borderRadius: 8,
          padding: "8px 10px",
        }}
      >
        <AudioPlayer rec={rec} />
      </div>
    </div>
  );
}

function CampaignPanel({
  campaign,
  defaultOpen,
}: {
  campaign: Campaign;
  defaultOpen?: boolean;
}) {
  const [data, setData] = useState<CampaignRecordings | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(defaultOpen ?? false);

  // Filters inside the panel
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [leadSearch, setLeadSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/qa/recordings/${campaign.id}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setData(json);
      setLoaded(true);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to load recordings");
    } finally {
      setLoading(false);
    }
  }, [campaign.id, loaded]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) load();
  };

  const totalRecs = data?.leads.reduce((s, l) => s + l.recordings.length, 0) ?? 0;

  // Apply search + date filter + sort
  const q = leadSearch.trim().toLowerCase();
  const filteredLeads: LeadWithRecordings[] = (data?.leads ?? [])
    .filter((lead) => {
      if (!q) return true;
      return (
        (lead.email ?? "").toLowerCase().includes(q) ||
        (lead.name ?? "").toLowerCase().includes(q) ||
        (lead.lead_id ?? "").toLowerCase().includes(q)
      );
    })
    .map((lead) => {
      const recs = lead.recordings
        .filter((rec) => {
          if (!dateRange || (!dateRange[0] && !dateRange[1])) return true;
          if (!rec.created_at) return false;
          const d = new Date(rec.created_at).getTime();
          const from = dateRange[0] ? dateRange[0].startOf("day").valueOf() : null;
          const to = dateRange[1] ? dateRange[1].endOf("day").valueOf() : null;
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        })
        .sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return sortOrder === "newest" ? tb - ta : ta - tb;
        });
      return { ...lead, recordings: recs };
    })
    .filter((lead) => lead.recordings.length > 0);

  const filteredTotal = filteredLeads.reduce((s, l) => s + l.recordings.length, 0);

  const handleExportZip = async () => {
    if (filteredTotal === 0) return;
    setExporting(true);
    const key = "zip-export";
    message.loading({ content: `Preparing ZIP (0 / ${filteredTotal})…`, key, duration: 0 });
    try {
      const zip = new JSZip();
      let done = 0;
      for (const lead of filteredLeads) {
        const folderName = (lead.name || lead.lead_id || lead.id)
          .replace(/[^a-zA-Z0-9._\- ]/g, "_")
          .slice(0, 60);
        const folder = zip.folder(folderName)!;
        for (const rec of lead.recordings) {
          if (!rec.url) continue;
          const resp = await fetch(rec.url);
          if (!resp.ok) continue;
          const buf = await resp.arrayBuffer();
          folder.file(
            ensureRecordingDownloadFilename(rec.display_name, rec.original_name),
            buf
          );
          done++;
          message.loading({ content: `Preparing ZIP (${done} / ${filteredTotal})…`, key, duration: 0 });
        }
      }
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const suffix = (leadSearch || dateRange) ? "-filtered" : "";
      a.href = url;
      a.download = `${campaign.name.replace(/[^a-zA-Z0-9._\- ]/g, "_")}_recordings${suffix}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      message.success({ content: `Downloaded ${done} recording${done !== 1 ? "s" : ""} as ZIP`, key });
      void fetch("/api/qa/recordings/export-audit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          export_kind: "recordings_zip",
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          recording_count: done,
        }),
      });
    } catch (e) {
      message.error({ content: e instanceof Error ? e.message : "Export failed", key });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      style={{
        border: "1px solid #e9e9e9",
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 12,
      }}
    >
      {/* Folder header */}
      <div
        onClick={handleToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 20px",
          background: open ? "#f5f0ff" : "#ffffff",
          cursor: "pointer",
          userSelect: "none",
          transition: "background 0.15s",
        }}
      >
        {open ? (
          <FolderOpenOutlined style={{ fontSize: 20, color: "#722ed1" }} />
        ) : (
          <FolderOutlined style={{ fontSize: 20, color: "#8b5cf6" }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong style={{ fontSize: 14 }}>
            {campaign.name}
          </Text>
          {campaign.campaign_id && (
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
              {campaign.campaign_id}
            </Text>
          )}
        </div>
        <Space>
          <Tag color={statusColor[campaign.status] ?? "default"} style={{ margin: 0 }}>
            {campaign.status}
          </Tag>
          {loaded && (
            <Badge
              count={totalRecs}
              style={{ backgroundColor: totalRecs > 0 ? "#722ed1" : "#d1d5db" }}
              showZero
              overflowCount={999}
            />
          )}
        </Space>
      </div>

      {/* Folder body */}
      {open && (
        <div style={{ borderTop: "1px solid #f0f0f0", background: "#fff" }}>
          {/* Filter bar */}
          {loaded && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 20px",
                borderBottom: "1px solid #f5f5f5",
                background: "#fafafa",
                flexWrap: "wrap",
              }}
            >
              <input
                placeholder="Search by email / name / lead ID…"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 13,
                  outline: "none",
                  width: 240,
                  background: "#fff",
                }}
              />
              <DatePicker.RangePicker
                size="small"
                value={dateRange ?? undefined}
                onChange={(dates) =>
                  setDateRange(dates as [Dayjs | null, Dayjs | null] | null)
                }
                allowClear
                placeholder={["From date", "To date"]}
                style={{ width: 240 }}
              />
              <Select
                size="small"
                value={sortOrder}
                onChange={(v) => setSortOrder(v)}
                style={{ width: 130 }}
                options={[
                  { value: "newest", label: "Newest first" },
                  { value: "oldest", label: "Oldest first" },
                ]}
              />
              {(leadSearch || dateRange || sortOrder !== "newest") && (
                <Button
                  size="small"
                  type="text"
                  onClick={() => {
                    setLeadSearch("");
                    setDateRange(null);
                    setSortOrder("newest");
                  }}
                >
                  Reset
                </Button>
              )}
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {filteredTotal} recording{filteredTotal !== 1 ? "s" : ""}
                  {(leadSearch || dateRange) ? " (filtered)" : ""}
                </Text>
                <Button
                  size="small"
                  icon={<FileZipOutlined />}
                  onClick={handleExportZip}
                  loading={exporting}
                  disabled={filteredTotal === 0}
                  style={{ borderColor: "#722ed1", color: "#722ed1" }}
                >
                  Export ZIP
                </Button>
              </div>
            </div>
          )}

          <div style={{ padding: "16px 20px" }}>
            {loading && (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <Spin />
              </div>
            )}
            {!loading && loaded && filteredLeads.length === 0 && (
              <Empty
                description={
                  dateRange
                    ? "No recordings found for the selected date range"
                    : "No recordings found for this campaign"
                }
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}
            {!loading && loaded && filteredLeads.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {filteredLeads.map((lead) => (
                  <div key={lead.id}>
                    {/* Lead header */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 12,
                        paddingBottom: 8,
                        borderBottom: "1px solid #f0f0f0",
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: "#f3f4f6",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <UserOutlined style={{ color: "#6b7280", fontSize: 13 }} />
                      </div>
                      <Text strong style={{ fontSize: 13 }}>
                        {lead.name || lead.lead_id || lead.id}
                      </Text>
                      {lead.lead_id && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {lead.lead_id}
                        </Text>
                      )}
                      {lead.email && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {lead.email}
                        </Text>
                      )}
                      {lead.agent_name && (
                        <Tag color="purple" style={{ margin: 0 }}>
                          {lead.agent_name}
                        </Tag>
                      )}
                      <Text type="secondary" style={{ fontSize: 11, marginLeft: "auto" }}>
                        {lead.recordings.length} recording{lead.recordings.length !== 1 ? "s" : ""}
                      </Text>
                    </div>

                    {/* 3-column recording grid */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                        gap: 12,
                      }}
                    >
                      {lead.recordings.map((rec) => (
                        <RecordingCard key={rec.path} rec={rec} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function QARecordingsPage() {
  const { status } = useRoleGuard(["qa", "admin"]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/qa/recordings", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load campaigns");
      setCampaigns(json.campaigns ?? []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authorized") fetchCampaigns();
  }, [status, fetchCampaigns]);

  const hasFilter = !!(search.trim() || statusFilter || (dateRange?.[0] || dateRange?.[1]));

  const filtered = campaigns.filter((c) => {
    if (search.trim() && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    if (dateRange?.[0] || dateRange?.[1]) {
      const start = c.start_date ? new Date(c.start_date).getTime() : null;
      const end = c.end_date ? new Date(c.end_date).getTime() : null;
      const from = dateRange[0] ? dateRange[0].startOf("day").valueOf() : null;
      const to = dateRange[1] ? dateRange[1].endOf("day").valueOf() : null;
      if (from && end && end < from) return false;
      if (to && start && start > to) return false;
    }
    return true;
  });

  if (status === "loading" || status === "redirecting") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px" }}>
      {/* Header */}
      <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            Recordings
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Voice logs organised by campaign and lead
          </Text>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={fetchCampaigns} loading={loading}>
            Refresh
          </Button>
        </Col>
      </Row>

      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          padding: "10px 16px",
          background: "#fafafa",
          border: "1px solid #f0f0f0",
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        <input
          placeholder="Search campaigns…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            border: "1px solid #d1d5db",
            borderRadius: 7,
            padding: "5px 11px",
            fontSize: 14,
            outline: "none",
            width: 200,
            background: "#fff",
          }}
        />
        <Select
          placeholder="All statuses"
          allowClear
          value={statusFilter ?? undefined}
          onChange={(v) => setStatusFilter(v ?? null)}
          style={{ width: 140 }}
          options={[
            { value: "active", label: "Active" },
            { value: "paused", label: "Paused" },
            { value: "completed", label: "Completed" },
            { value: "draft", label: "Draft" },
          ]}
        />
        <DatePicker.RangePicker
          value={dateRange ?? undefined}
          onChange={(dates) =>
            setDateRange(dates as [Dayjs | null, Dayjs | null] | null)
          }
          allowClear
          placeholder={["Campaign from", "Campaign to"]}
          style={{ width: 260 }}
        />
        {hasFilter && (
          <Button
            type="text"
            size="small"
            onClick={() => {
              setSearch("");
              setStatusFilter(null);
              setDateRange(null);
            }}
          >
            Clear filters
          </Button>
        )}
        <Text type="secondary" style={{ fontSize: 12, marginLeft: "auto" }}>
          {filtered.length} campaign{filtered.length !== 1 ? "s" : ""}
          {hasFilter ? " (filtered)" : ""}
        </Text>
      </div>

      {/* Campaign folder list */}
      {loading ? (
        <Card style={{ textAlign: "center", padding: 40 }}>
          <Spin size="large" />
        </Card>
      ) : filtered.length === 0 ? (
        <Empty description={hasFilter ? "No campaigns match your filters" : "No campaigns found"} />
      ) : (
        <div>
          {filtered.map((c) => (
            <CampaignPanel key={c.id} campaign={c} />
          ))}
        </div>
      )}
    </div>
  );
}
