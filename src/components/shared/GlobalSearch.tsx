"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spin } from "antd";
import {
  SearchOutlined,
  RocketOutlined,
  FunnelPlotOutlined,
  TeamOutlined,
  CloseOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultType = "campaign" | "lead" | "user";

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
  users: SearchResult[];
};

type Category = "all" | "campaigns" | "leads" | "users";

// ─── Category configs ─────────────────────────────────────────────────────────

const ALL_CATEGORIES: {
  key: Category;
  label: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  { key: "all",       label: "All",       icon: <SearchOutlined />,      color: "#4f46e5" },
  { key: "campaigns", label: "Campaigns", icon: <RocketOutlined />,       color: "#7c3aed" },
  { key: "leads",     label: "Leads",     icon: <FunnelPlotOutlined />,   color: "#ea580c" },
  { key: "users",     label: "Users",     icon: <TeamOutlined />,         color: "#0891b2" },
];

const TYPE_CONFIG: Record<
  ResultType,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  campaign: { label: "Campaign", color: "#6d28d9", bg: "#ede9fe", icon: <RocketOutlined /> },
  lead:     { label: "Lead",     color: "#c2410c", bg: "#ffedd5", icon: <FunnelPlotOutlined /> },
  user:     { label: "User",     color: "#0369a1", bg: "#e0f2fe", icon: <TeamOutlined /> },
};

const SECTION_ORDER: (keyof SearchResults)[] = ["campaigns", "leads", "users"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

/** Derive which categories to show for the current user's primary role. */
function useCategoriesForRole(): typeof ALL_CATEGORIES {
  const { roles } = useAuth();
  const normalized = roles.map((r) =>
    (r.role_name || r.name || "").toLowerCase().trim().replace(/\s+/g, "_")
  );

  const isAdmin = normalized.includes("admin");
  const isTL    =
    normalized.includes("team_leader") ||
    normalized.includes("tl") ||
    normalized.includes("operations_manager");

  // Admin and TL see the Users category; everyone else doesn't
  if (isAdmin || isTL) return ALL_CATEGORIES;
  return ALL_CATEGORIES.filter((c) => c.key !== "users");
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GlobalSearch() {
  const router       = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const dropdownRef  = useRef<HTMLDivElement>(null);

  const [query,       setQuery]       = useState("");
  const [open,        setOpen]        = useState(false);
  const [category,    setCategory]    = useState<Category>("all");
  const [results,     setResults]     = useState<SearchResults>({ campaigns: [], leads: [], users: [] });
  const [loading,     setLoading]     = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debouncedQuery = useDebounce(query, 300);
  const visibleCats    = useCategoriesForRole();

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchResults = useCallback(async (q: string, cat: Category) => {
    if (!q.trim()) {
      setResults({ campaigns: [], leads: [], users: [] });
      return;
    }
    setLoading(true);
    try {
      const res  = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&category=${cat}`,
        { credentials: "include" }
      );
      const json = await res.json();
      setResults(json.results ?? { campaigns: [], leads: [], users: [] });
    } catch {
      setResults({ campaigns: [], leads: [], users: [] });
    } finally {
      setLoading(false);
    }
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    if (debouncedQuery) void fetchResults(debouncedQuery, category);
    else setResults({ campaigns: [], leads: [], users: [] });
  }, [debouncedQuery, category, fetchResults]);

  // ── Click outside ─────────────────────────────────────────────────────────

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Keyboard nav ──────────────────────────────────────────────────────────

  const flat = flattenResults(results);

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

  const navigateTo = (item: SearchResult) => {
    router.push(item.url);
    setOpen(false);
    setQuery("");
  };

  const clearQuery = () => {
    setQuery("");
    setResults({ campaigns: [], leads: [], users: [] });
    inputRef.current?.focus();
  };

  const visibleSections =
    category === "all"
      ? SECTION_ORDER.filter((k) => (results[k]?.length ?? 0) > 0)
      : SECTION_ORDER.filter((k) => k === category && (results[k]?.length ?? 0) > 0);

  const hasResults = visibleSections.length > 0;

  // ── Render result row ─────────────────────────────────────────────────────

  let flatIdx = -1;

  const renderSection = (key: keyof SearchResults) => {
    const items = results[key];
    if (!items?.length) return null;

    const cat = ALL_CATEGORIES.find((c) => c.key === key)!;
    const tc  = TYPE_CONFIG[key === "campaigns" ? "campaign" : key === "leads" ? "lead" : "user"];

    return (
      <div key={key}>
        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 6px" }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: cat.color,
            }}
          >
            {cat.label}
          </span>
          <div style={{ flex: 1, height: 1, background: "#f0f0f0" }} />
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: cat.color,
              background: tc.bg,
              borderRadius: 10,
              padding: "1px 7px",
            }}
          >
            {items.length}
          </span>
        </div>

        {/* Items */}
        {items.map((item) => {
          flatIdx++;
          const idx      = flatIdx;
          const isActive = activeIndex === idx;

          return (
            <div
              key={item.id}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => { e.preventDefault(); navigateTo(item); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 16px",
                cursor: "pointer",
                background: isActive ? "#f5f7ff" : "transparent",
                borderLeft: isActive ? `3px solid ${cat.color}` : "3px solid transparent",
                transition: "all 0.12s ease",
              }}
            >
              {/* Icon bubble */}
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
                  transition: "all 0.12s",
                }}
              >
                {tc.icon}
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#111827",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    lineHeight: "1.4",
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "#6b7280",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    lineHeight: "1.4",
                    marginTop: 1,
                  }}
                >
                  {item.subtitle}
                  {item.meta && (
                    <>
                      <span style={{ color: "#d1d5db", margin: "0 4px" }}>·</span>
                      <span style={{ color: "#9ca3af" }}>{item.meta}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Arrow */}
              <ArrowRightOutlined
                style={{
                  fontSize: 11,
                  color: isActive ? cat.color : "#e5e7eb",
                  flexShrink: 0,
                  transition: "color 0.12s",
                }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes gs-enter {
          from { opacity: 0; transform: translateY(-5px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)    scale(1);     }
        }
        .gs-shared-input::placeholder { color: #9ca3af; }
        .gs-shared-cat:hover { opacity: 0.85; }
      `}</style>

      <div ref={containerRef} style={{ position: "relative", width: 300, flexShrink: 0 }}>

        {/* ─── Search Input ──────────────────────────────────────────────────── */}
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
          <SearchOutlined
            style={{ fontSize: 14, color: open ? "#4f46e5" : "#9ca3af", flexShrink: 0 }}
          />
          <input
            ref={inputRef}
            className="gs-shared-input"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search anything..."
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              color: "#111827",
              fontFamily: "inherit",
            }}
          />
          {loading && <Spin size="small" style={{ flexShrink: 0 }} />}
          {query && !loading && (
            <CloseOutlined
              onMouseDown={(e) => { e.preventDefault(); clearQuery(); }}
              style={{ fontSize: 11, color: "#9ca3af", cursor: "pointer", flexShrink: 0 }}
            />
          )}
        </div>

        {/* ─── Dropdown ──────────────────────────────────────────────────────── */}
        {open && (
          <div
            ref={dropdownRef}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              width: 420,
              maxHeight: 520,
              background: "#fff",
              borderRadius: 14,
              boxShadow:
                "0 4px 6px -1px rgba(0,0,0,0.07), 0 12px 40px -4px rgba(0,0,0,0.13)",
              border: "1px solid #e5e7eb",
              zIndex: 9999,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              animation: "gs-enter 0.15s ease",
            }}
          >
            {/* ── Category filter tabs ─────────────────────────────────────── */}
            <div
              style={{
                display: "flex",
                gap: 4,
                padding: "10px 12px",
                borderBottom: "1px solid #f3f4f6",
                overflowX: "auto",
                flexShrink: 0,
                scrollbarWidth: "none",
              }}
            >
              {visibleCats.map((cat) => {
                const isActive = category === cat.key;
                return (
                  <button
                    key={cat.key}
                    className="gs-shared-cat"
                    onMouseDown={(e) => { e.preventDefault(); setCategory(cat.key); }}
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
                      outline: "none",
                      transition: "all 0.15s",
                      fontFamily: "inherit",
                    }}
                  >
                    <span style={{ fontSize: 11, lineHeight: 1 }}>{cat.icon}</span>
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* ── Body ───────────────────────────────────────────────────────── */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {!debouncedQuery ? (
                /* Idle state */
                <div style={{ padding: "32px 20px", textAlign: "center" }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: "#f3f4f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 12px",
                    }}
                  >
                    <SearchOutlined style={{ fontSize: 20, color: "#9ca3af" }} />
                  </div>
                  <div
                    style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}
                  >
                    Start searching
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>
                    Search across Campaigns, Leads and more
                  </div>
                </div>
              ) : loading ? (
                /* Loading state */
                <div style={{ padding: "32px 20px", textAlign: "center" }}>
                  <Spin size="small" />
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 10 }}>
                    Searching...
                  </div>
                </div>
              ) : !hasResults ? (
                /* Empty state */
                <div style={{ padding: "32px 20px", textAlign: "center" }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: "#fef3c7",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 12px",
                    }}
                  >
                    <SearchOutlined style={{ fontSize: 20, color: "#f59e0b" }} />
                  </div>
                  <div
                    style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}
                  >
                    No results found
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>
                    Try a different keyword or switch category
                  </div>
                </div>
              ) : (
                /* Results */
                <div style={{ paddingBottom: 4 }}>
                  {visibleSections.map((k) => renderSection(k))}
                </div>
              )}
            </div>

            {/* ── Footer keyboard hints ──────────────────────────────────────── */}
            {hasResults && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 16,
                  padding: "8px 14px",
                  borderTop: "1px solid #f3f4f6",
                  background: "#fafafa",
                  flexShrink: 0,
                }}
              >
                {(
                  [
                    { keys: ["↑", "↓"], label: "Navigate" },
                    { keys: ["↵"],       label: "Open" },
                    { keys: ["Esc"],      label: "Close" },
                  ] as { keys: string[]; label: string }[]
                ).map(({ keys, label }) => (
                  <span
                    key={label}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      color: "#9ca3af",
                    }}
                  >
                    <span style={{ display: "inline-flex", gap: 2 }}>
                      {keys.map((k) => (
                        <kbd
                          key={k}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: 18,
                            minWidth: 18,
                            padding: "0 4px",
                            background: "#fff",
                            border: "1px solid #e5e7eb",
                            borderBottom: "2px solid #d1d5db",
                            borderRadius: 4,
                            fontSize: 10,
                            fontFamily: "inherit",
                            fontWeight: 600,
                            color: "#6b7280",
                            lineHeight: 1,
                          }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                    <span>{label}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
