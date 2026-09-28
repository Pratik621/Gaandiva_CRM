"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Empty,
  Input,
  Modal,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CloseOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { fetchWithAuthRetry } from "@/lib/api/fetch-with-auth-retry";
import type { CampaignFeedLeadRef } from "@/lib/command/campaign-feed-types";

const { Text } = Typography;

const STATUS_COLORS: Record<string, string> = {
  qualified: "#16a34a",
  new: "#4f46e5",
  contacted: "#0891b2",
  disqualified: "#ef4444",
  converted: "#7c3aed",
  closed: "#6b7280",
};

function statusColor(s: string): string {
  return STATUS_COLORS[s?.toLowerCase()] ?? "#6b7280";
}

type LeadPickerModalProps = {
  open: boolean;
  campaignId: string;
  selected: CampaignFeedLeadRef[];
  onConfirm: (leads: CampaignFeedLeadRef[]) => void;
  onCancel: () => void;
};

export default function LeadPickerModal({
  open,
  campaignId,
  selected,
  onConfirm,
  onCancel,
}: LeadPickerModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CampaignFeedLeadRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<CampaignFeedLeadRef[]>(selected);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset draft to current selected whenever modal opens
  useEffect(() => {
    if (open) {
      setDraft(selected);
      setQuery("");
      setResults([]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchLeads = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const excludeParam = draft.map((l) => l.id).join(",");
        const url =
          `/api/command/campaigns/${campaignId}/feed/leads/search?limit=500` +
          (q ? `&q=${encodeURIComponent(q)}` : "") +
          (excludeParam ? `&exclude_ids=${encodeURIComponent(excludeParam)}` : "");
        const res = await fetchWithAuthRetry(url);
        const data = (await res.json()) as {
          leads?: CampaignFeedLeadRef[];
          error?: string;
        };
        setResults(data.leads ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [campaignId, draft]
  );

  // Debounce search
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchLeads(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, fetchLeads]);

  const draftIds = new Set(draft.map((l) => l.id));

  const toggleLead = (lead: CampaignFeedLeadRef) => {
    if (draftIds.has(lead.id)) {
      setDraft((prev) => prev.filter((l) => l.id !== lead.id));
    } else {
      setDraft((prev) => [...prev, lead]);
    }
  };

  const toggleAll = () => {
    const unchecked = results.filter((r) => !draftIds.has(r.id));
    if (unchecked.length > 0) {
      // Select all unchecked
      setDraft((prev) => {
        const newIds = new Set(prev.map((l) => l.id));
        const toAdd = results.filter((r) => !newIds.has(r.id));
        return [...prev, ...toAdd];
      });
    } else {
      // Deselect all from current results
      const resultIds = new Set(results.map((r) => r.id));
      setDraft((prev) => prev.filter((l) => !resultIds.has(l.id)));
    }
  };

  const allChecked =
    results.length > 0 && results.every((r) => draftIds.has(r.id));
  const someChecked =
    results.some((r) => draftIds.has(r.id)) && !allChecked;

  const displayName = (lead: CampaignFeedLeadRef): string =>
    lead.name?.trim() || lead.email || lead.id.slice(0, 8);

  return (
    <Modal
      open={open}
      title={
        <Space>
          <TeamOutlined style={{ color: "#4f46e5" }} />
          <span>Attach Leads</span>
          {draft.length > 0 && (
            <Tag color="blue" style={{ marginLeft: 4 }}>
              {draft.length} selected
            </Tag>
          )}
        </Space>
      }
      onCancel={onCancel}
      onOk={() => onConfirm(draft)}
      okText={
        draft.length > 0 ? `Attach ${draft.length} Lead${draft.length > 1 ? "s" : ""}` : "Attach"
      }
      okButtonProps={{ disabled: draft.length === 0 }}
      width={560}
      destroyOnClose
      styles={{
        body: { padding: "12px 0 0" },
      }}
    >
      {/* Search */}
      <div style={{ padding: "0 24px 12px" }}>
        <Input
          autoFocus
          prefix={<SearchOutlined style={{ color: "#9ca3af" }} />}
          placeholder="Search by name, company name, or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
        />
      </div>

      {/* Results list */}
      <div
        style={{
          borderTop: "1px solid #f3f4f6",
          borderBottom: "1px solid #f3f4f6",
          maxHeight: 300,
          overflowY: "auto",
        }}
      >
        {/* Select all row */}
        {results.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 24px",
              background: "#f9fafb",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <Checkbox
              checked={allChecked}
              indeterminate={someChecked}
              onChange={toggleAll}
            />
            <Text style={{ fontSize: 12, color: "#6b7280" }}>Select all</Text>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <Spin size="small" />
          </div>
        )}

        {!loading && results.length === 0 && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              query
                ? "No delivered leads match your search"
                : "No delivered leads in this campaign yet"
            }
            style={{ padding: "24px 0" }}
          />
        )}

        {!loading &&
          results.map((lead) => (
            <div
              key={lead.id}
              onClick={() => toggleLead(lead)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 24px",
                cursor: "pointer",
                background: draftIds.has(lead.id) ? "#eff6ff" : "transparent",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                if (!draftIds.has(lead.id))
                  (e.currentTarget as HTMLDivElement).style.background =
                    "#f9fafb";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background =
                  draftIds.has(lead.id) ? "#eff6ff" : "transparent";
              }}
            >
              <Checkbox
                checked={draftIds.has(lead.id)}
                onChange={() => toggleLead(lead)}
                onClick={(e) => e.stopPropagation()}
              />
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "#e0e7ff",
                  color: "#4f46e5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: 13,
                }}
              >
                <UserOutlined />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#111827",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {displayName(lead)}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#6b7280",
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginTop: 1,
                  }}
                >
                  {lead.company_name && (
                    <span>{lead.company_name}</span>
                  )}
                  {lead.email && <span>· {lead.email}</span>}
                </div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#fff",
                  background: statusColor(lead.status),
                  borderRadius: 6,
                  padding: "2px 6px",
                  textTransform: "capitalize",
                  flexShrink: 0,
                }}
              >
                {lead.status}
              </span>
            </div>
          ))}
      </div>

      {/* Selected chips */}
      {draft.length > 0 && (
        <div style={{ padding: "10px 24px 0" }}>
          <Text style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 6 }}>
            Selected:
          </Text>
          <Space wrap size={[6, 6]}>
            {draft.map((lead) => (
              <Tooltip
                key={lead.id}
                title={
                  <span>
                    {lead.company_name && `${lead.company_name} · `}
                    {lead.email}
                  </span>
                }
              >
                <Tag
                  closable
                  onClose={(e) => {
                    e.preventDefault();
                    setDraft((prev) => prev.filter((l) => l.id !== lead.id));
                  }}
                  closeIcon={<CloseOutlined style={{ fontSize: 9 }} />}
                  style={{
                    borderRadius: 8,
                    background: "#eff6ff",
                    borderColor: "#bfdbfe",
                    color: "#1d4ed8",
                    fontSize: 12,
                    padding: "2px 8px",
                  }}
                >
                  {displayName(lead)}
                </Tag>
              </Tooltip>
            ))}
          </Space>
        </div>
      )}
    </Modal>
  );
}
