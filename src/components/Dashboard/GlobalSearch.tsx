"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SearchOutlined,
  RocketOutlined,
  FunnelPlotOutlined,
  AlertOutlined,
  CloseOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";

type ResultType = "campaign" | "lead" | "alert";
type Category = "all" | "campaigns" | "leads" | "alerts";

type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  meta?: string | null;
  type: ResultType;
  url: string;
};

type SearchResults = {
  campaigns: SearchResult[];
  leads: SearchResult[];
  alerts: SearchResult[];
};

const CATEGORIES: { key: Category; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "all", label: "All", icon: <SearchOutlined />, color: "#4f46e5" },
  { key: "campaigns", label: "Campaigns", icon: <RocketOutlined />, color: "#7c3aed" },
  { key: "leads", label: "Leads", icon: <FunnelPlotOutlined />, color: "#ea580c" },
  { key: "alerts", label: "Alerts", icon: <AlertOutlined />, color: "#ef4444" },
];

const TYPE_CONFIG: Record<ResultType, { color: string; bg: string; icon: React.ReactNode }> = {
  campaign: { color: "#6d28d9", bg: "#ede9fe", icon: <RocketOutlined /> },
  lead: { color: "#c2410c", bg: "#ffedd5", icon: <FunnelPlotOutlined /> },
  alert: { color: "#ef4444", bg: "#fff1f0", icon: <AlertOutlined /> },
};

const SECTION_ORDER: (keyof SearchResults)[] = ["campaigns", "leads", "alerts"];

function flattenResults(r: SearchResults): SearchResult[] {
  return SECTION_ORDER.flatMap((k) => r[k] ?? []);
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const EMPTY_RESULTS: SearchResults = { campaigns: [], leads: [], alerts: [] };

export default function DashboardGlobalSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("all");
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debouncedQuery = useDebounce(query, 250);
  const flat = flattenResults(results);

  const fetchResults = useCallback(async (q: string, cat: Category) => {
    if (!q.trim()) {
      setResults(EMPTY_RESULTS);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/search?q=${encodeURIComponent(q)}&category=${cat}`, {
        credentials: "include",
      });
      const json = (await res.json()) as { results?: SearchResults };
      setResults(json.results ?? EMPTY_RESULTS);
    } catch {
      setResults(EMPTY_RESULTS);
    } finally {
      setLoading(false);
    }
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    if (debouncedQuery) void fetchResults(debouncedQuery, category);
    else setResults(EMPTY_RESULTS);
  }, [debouncedQuery, category, fetchResults]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const navigateTo = (item: SearchResult) => {
    router.push(item.url);
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0 && flat[activeIndex]) {
      e.preventDefault();
      navigateTo(flat[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const clearQuery = () => {
    setQuery("");
    setResults(EMPTY_RESULTS);
    inputRef.current?.focus();
  };

  const visibleSections =
    category === "all"
      ? SECTION_ORDER.filter((k) => (results[k]?.length ?? 0) > 0)
      : SECTION_ORDER.filter((k) => k === category && (results[k]?.length ?? 0) > 0);

  const hasResults = visibleSections.length > 0;
  let flatIdx = -1;

  const renderSection = (key: keyof SearchResults) => {
    const items = results[key];
    if (!items?.length) return null;
    const cat = CATEGORIES.find((c) => c.key === key)!;
    return (
      <div key={key}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 6px" }}>
          <span
            style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: cat.color }}
          >
            {cat.label}
          </span>
          <div style={{ flex: 1, height: 1, background: "#f0f0f0" }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: cat.color, background: "#f5f5f5", borderRadius: 10, padding: "1px 7px" }}>
            {items.length}
          </span>
        </div>

        {items.map((item) => {
          flatIdx++;
          const idx = flatIdx;
          const isActive = activeIndex === idx;
          const tc = TYPE_CONFIG[item.type];
          return (
            <div
              key={`${item.type}-${item.id}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                navigateTo(item);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 16px",
                cursor: "pointer",
                background: isActive ? "#f5f7ff" : "transparent",
                borderLeft: isActive ? `3px solid ${cat.color}` : "3px solid transparent",
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: isActive ? tc.bg : "#f7f7f8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: isActive ? tc.color : "#9ca3af",
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                {tc.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 11.5, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
                  {item.subtitle}
                  {item.meta && (
                    <>
                      <span style={{ color: "#d1d5db", margin: "0 4px" }}>·</span>
                      <span style={{ color: "#9ca3af" }}>{item.meta}</span>
                    </>
                  )}
                </div>
              </div>
              <ArrowRightOutlined style={{ fontSize: 11, color: isActive ? cat.color : "#e5e7eb", flexShrink: 0 }} />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: 400, maxWidth: "min(400px, 100%)", flexShrink: 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 38,
          padding: "0 12px",
          background: open ? "#fff" : "#f4f6f8",
          border: `1.5px solid ${open ? "#4f46e5" : "#e5e7eb"}`,
          borderRadius: 10,
          boxShadow: open ? "0 0 0 3px rgba(79,70,229,0.08)" : "none",
          transition: "all 0.18s ease",
        }}
      >
        <SearchOutlined style={{ fontSize: 14, color: open ? "#4f46e5" : "#9ca3af", flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search campaigns, leads, alerts..."
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#111827", fontFamily: "inherit" }}
        />
        {loading && (
          <span style={{ flexShrink: 0, fontSize: 11, color: "#9ca3af", fontWeight: 500 }}>…</span>
        )}
        {query && !loading && (
          <CloseOutlined
            onMouseDown={(e) => {
              e.preventDefault();
              clearQuery();
            }}
            style={{ fontSize: 11, color: "#9ca3af", cursor: "pointer", flexShrink: 0 }}
          />
        )}
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: 440,
            maxWidth: "min(440px, calc(100vw - 140px))",
            maxHeight: 520,
            background: "#fff",
            borderRadius: 14,
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.07), 0 12px 40px -4px rgba(0,0,0,0.13)",
            border: "1px solid #e5e7eb",
            zIndex: 9999,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", gap: 4, padding: "10px 12px", borderBottom: "1px solid #f3f4f6", overflowX: "auto", flexShrink: 0 }}>
            {CATEGORIES.map((cat) => {
              const isActive = category === cat.key;
              return (
                <button
                  key={cat.key}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setCategory(cat.key);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 11px",
                    borderRadius: 8,
                    border: "none",
                    background: isActive ? cat.color : "#f3f4f6",
                    color: isActive ? "#fff" : "#4b5563",
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    fontFamily: "inherit",
                  }}
                >
                  {cat.icon}
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {!debouncedQuery ? (
              <div style={{ padding: "28px 20px", textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
                Start typing to search dashboard data.
              </div>
            ) : loading ? (
              <div style={{ padding: "28px 20px", textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
                Searching…
              </div>
            ) : !hasResults ? (
              <div style={{ padding: "28px 20px", textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
                No results found.
              </div>
            ) : (
              <div style={{ paddingBottom: 4 }}>{visibleSections.map((k) => renderSection(k))}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
