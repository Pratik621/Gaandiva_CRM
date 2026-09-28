"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Progress,
  Row,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  BankOutlined,
  ClearOutlined,
  DatabaseOutlined,
  EnvironmentOutlined,
  FilterOutlined,
  GlobalOutlined,
  LineChartOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  getCitiesForSelection,
  getStatesForCountries,
  pruneGeoSelection,
} from "@/lib/command/check-data-geo";
import {
  analyzeLeadSpecs,
  analyzeLeadSpecsAsync,
  computeAnalysisDelayMs,
  computeGlobalAudienceStats,
  EMPTY_LEAD_SPECS,
  formatAudienceLac,
  formatAudienceMillions,
  formatSummaryCount,
  getActiveFilterChips,
  getActiveFilterCount,
  getAnalysisLoadingMessage,
  getFieldDefinition,
  GLOBAL_AUDIENCE_TOTAL_MILLIONS,
  SPEC_FIELD_DEFINITIONS,
  type CheckDataResults,
  type LeadSpecs,
  type PreviewRecord,
  type SpecFieldType,
} from "@/lib/command/check-data";
import type { B2BSpecEntry, B2BSpecFieldKey } from "@/lib/command/check-data-b2b-specs";
import B2BSpecsBuilder from "@/components/command/B2BSpecsBuilder";
import { PREVIEW_ROW_COUNT } from "@/lib/command/check-data-locale";

const { Title, Text } = Typography;

function useAnimatedNumber(target: number, duration = 600): number {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef<number>();
  const startRef = useRef({ from: target, start: 0 });

  useEffect(() => {
    const from = display;
    if (from === target) return;

    startRef.current = { from, start: performance.now() };

    const tick = (now: number) => {
      const elapsed = now - startRef.current.start;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(startRef.current.from + (target - startRef.current.from) * eased);
      setDisplay(next);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface SummaryCardProps {
  title: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  loading?: boolean;
  format?: "number" | "percent" | "lac" | "million";
}

interface AudienceStatCardProps {
  label: string;
  value: string;
  loading?: boolean;
  highlighted?: boolean;
}

function AudienceStatCard({ label, value, loading, highlighted }: AudienceStatCardProps) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: highlighted ? "1px solid #a5b4fc" : "1px solid #eef2f6",
        background: highlighted ? "linear-gradient(135deg, #eef2ff 0%, #fff 100%)" : "#fff",
        height: "100%",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
        boxShadow: highlighted ? "0 2px 12px rgba(79, 70, 229, 0.12)" : undefined,
      }}
      className="check-data-audience-card"
    >
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 1, width: ["70%", "45%"] }} />
      ) : (
        <>
          <Text
            type="secondary"
            style={{
              fontSize: 11,
              fontWeight: 500,
              lineHeight: 1.3,
              display: "block",
              marginBottom: 4,
            }}
          >
            {label}
          </Text>
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: "#0f172a",
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
            }}
          >
            {value}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  suffix,
  icon,
  color,
  bg,
  loading,
  format = "number",
}: SummaryCardProps) {
  const animated = useAnimatedNumber(value);
  const display =
    format === "percent"
      ? `${animated.toFixed(1)}%`
      : format === "lac"
        ? formatAudienceLac(animated)
        : format === "million"
          ? formatAudienceMillions(animated / 1_000_000)
          : formatCount(animated) + (suffix ?? "");

  return (
    <Card
      bordered={false}
      style={{
        borderRadius: 14,
        background: `linear-gradient(135deg, ${bg} 0%, #ffffff 100%)`,
        border: "1px solid rgba(0,0,0,0.04)",
        boxShadow: "0 4px 20px rgba(15,23,42,0.06)",
        height: "100%",
        transition: "transform 0.25s ease, box-shadow 0.25s ease",
      }}
      styles={{ body: { padding: "20px 22px" } }}
      className="check-data-summary-card"
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 20,
                boxShadow: `0 6px 16px ${color}44`,
              }}
            >
              {icon}
            </div>
            <Badge
              count="Live"
              style={{
                background: "#ecfdf5",
                color: "#16a34a",
                border: "1px solid #a7f3d0",
                fontSize: 10,
                fontWeight: 600,
              }}
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
              {title}
            </Text>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#0f172a",
                lineHeight: 1.2,
                marginTop: 4,
                letterSpacing: "-0.02em",
              }}
            >
              {display}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function BlurredCell({ value }: { value: string }) {
  return (
    <Tooltip title="Upgrade to unlock full contact details">
      <span
        style={{
          filter: "blur(4px)",
          userSelect: "none",
          color: "#64748b",
          cursor: "default",
        }}
        aria-hidden
      >
        {value}
      </span>
    </Tooltip>
  );
}

function PartialBlurredCompany({ value }: { value: string }) {
  const blurStart = Math.max(1, value.length - Math.max(4, Math.ceil(value.length * 0.35)));
  const visible = value.slice(0, blurStart).trimEnd();
  const hidden = value.slice(blurStart) || "•••";

  return (
    <Tooltip title="Upgrade to unlock full company details">
      <span style={{ cursor: "default" }}>
        <Text>{visible}</Text>
        <span
          style={{
            filter: "blur(4px)",
            userSelect: "none",
            color: "#64748b",
          }}
          aria-hidden
        >
          {hidden}
        </span>
      </span>
    </Tooltip>
  );
}

interface SpecFieldProps {
  field: SpecFieldType;
  specs: LeadSpecs;
  stateOptions: string[];
  cityOptions: string[];
  onChange: (field: SpecFieldType, values: string[]) => void;
}

function SpecField({ field, specs, stateOptions, cityOptions, onChange }: SpecFieldProps) {
  const def = getFieldDefinition(field);
  const values = specs[field];

  let options: string[] = def.options ?? [];
  let disabled = false;
  let hint: string | undefined;

  if (field === "state") {
    options = stateOptions;
    disabled = specs.country.length === 0;
    hint = disabled ? "Select a country first" : undefined;
  } else if (field === "city") {
    options = cityOptions;
    disabled = specs.country.length === 0;
    hint = disabled ? "Select a country first" : undefined;
  }

  const label = (
    <Text strong style={{ fontSize: 13, color: "#334155" }}>
      {def.label}
    </Text>
  );

  return (
    <div>
      {label}
      <Select
        mode="multiple"
        showSearch
        allowClear
        disabled={disabled}
        style={{ width: "100%", marginTop: 6 }}
        placeholder={disabled ? hint : def.placeholder}
        value={values}
        onChange={(v) => onChange(field, v)}
        options={options.map((o) => ({ value: o, label: o }))}
        maxTagCount="responsive"
        optionFilterProp="label"
      />
      {hint && !disabled && field === "state" && specs.state.length === 0 && (
        <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: "block" }}>
          Showing regions for selected {specs.country.length === 1 ? "country" : "countries"}
        </Text>
      )}
      {hint && !disabled && field === "city" && specs.city.length === 0 && (
        <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: "block" }}>
          {specs.state.length
            ? "Showing cities for selected states"
            : "Showing all cities for selected countries"}
        </Text>
      )}
    </div>
  );
}

const SECTION_META = {
  geography: { title: "Geography", icon: <GlobalOutlined />, color: "#4f46e5" },
  company: { title: "Company Profile", icon: <BankOutlined />, color: "#16a34a" },
  contact: { title: "Contact Criteria", icon: <UserOutlined />, color: "#7c3aed" },
  custom: { title: "Advanced B2B Specs", icon: <FilterOutlined />, color: "#ea580c" },
} as const;

export default function CheckDataPanel() {
  const [specs, setSpecs] = useState<LeadSpecs>({ ...EMPTY_LEAD_SPECS });
  const [analyzing, setAnalyzing] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [analyzeFlash, setAnalyzeFlash] = useState(false);
  const [displayData, setDisplayData] = useState<CheckDataResults>(() => analyzeLeadSpecs(EMPTY_LEAD_SPECS));
  const abortRef = useRef<AbortController | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);

  const stateOptions = useMemo(() => getStatesForCountries(specs.country), [specs.country]);
  const cityOptions = useMemo(
    () => getCitiesForSelection(specs.country, specs.state),
    [specs.country, specs.state]
  );

  const activeFilterCount = useMemo(() => getActiveFilterCount(specs), [specs]);
  const activeChips = useMemo(() => getActiveFilterChips(specs), [specs]);
  const audienceStats = useMemo(() => computeGlobalAudienceStats(specs), [specs]);
  const useLacFormat = activeFilterCount > 0;
  const countCardFormat = useLacFormat ? "lac" : "million";
  const formatLeadCount = useCallback(
    (n: number) => formatSummaryCount(n, useLacFormat),
    [useLacFormat]
  );
  const audienceTotalFormatted = useMemo(() => {
    if (activeFilterCount === 0) {
      return formatAudienceMillions(GLOBAL_AUDIENCE_TOTAL_MILLIONS);
    }
    const total = audienceStats.reduce((sum, s) => sum + s.count, 0);
    return formatAudienceLac(total);
  }, [activeFilterCount, audienceStats]);
  const loadingMessage = useMemo(() => getAnalysisLoadingMessage(specs), [specs]);
  const estimatedDelayMs = useMemo(() => computeAnalysisDelayMs(specs), [specs]);
  const dataLoading = previewLoading || analyzing;

  useEffect(() => {
    previewAbortRef.current?.abort();
    const ac = new AbortController();
    previewAbortRef.current = ac;
    setPreviewLoading(true);

    const delayMs = computeAnalysisDelayMs(specs);
    const timer = setTimeout(() => {
      if (ac.signal.aborted) return;
      setDisplayData(analyzeLeadSpecs(specs));
      setPreviewLoading(false);
    }, delayMs);

    return () => {
      ac.abort();
      clearTimeout(timer);
    };
  }, [specs]);

  const updateField = useCallback((field: SpecFieldType, values: string[]) => {
    setSpecs((prev) => {
      const next = { ...prev, [field]: values };
      if (field === "country") {
        const pruned = pruneGeoSelection(values, prev.state, prev.city);
        next.state = pruned.states;
        next.city = pruned.cities;
      } else if (field === "state") {
        const validCities = getCitiesForSelection(prev.country, values);
        next.city = prev.city.filter((c) => validCities.includes(c));
      }
      return next;
    });
  }, []);

  const updateB2BSpecs = useCallback((b2b_specs: B2BSpecEntry[]) => {
    setSpecs((prev) => ({ ...prev, b2b_specs }));
  }, []);

  const removeChip = useCallback(
    (chip: {
      kind: "standard" | "b2b";
      field: SpecFieldType | B2BSpecFieldKey;
      value: string;
      b2bEntryId?: string;
    }) => {
      if (chip.kind === "b2b" && chip.b2bEntryId) {
        setSpecs((prev) => ({
          ...prev,
          b2b_specs: prev.b2b_specs.map((e) =>
            e.id === chip.b2bEntryId ? { ...e, values: e.values.filter((v) => v !== chip.value) } : e
          ),
        }));
        return;
      }

      setSpecs((prev) => {
        const field = chip.field as SpecFieldType;
        const nextValues = prev[field].filter((v) => v !== chip.value);
        const next = { ...prev, [field]: nextValues };
        if (field === "country") {
          const pruned = pruneGeoSelection(nextValues, prev.state, prev.city);
          next.state = pruned.states;
          next.city = pruned.cities;
        } else if (field === "state") {
          const validCities = getCitiesForSelection(prev.country, nextValues);
          next.city = prev.city.filter((c) => validCities.includes(c));
        }
        return next;
      });
    },
    []
  );

  const clearAll = useCallback(() => setSpecs({ ...EMPTY_LEAD_SPECS }), []);

  const handleAnalyze = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setAnalyzing(true);
    try {
      const result = await analyzeLeadSpecsAsync(specs, { signal: ac.signal });
      if (!ac.signal.aborted) {
        setDisplayData(result);
        setAnalyzeFlash(true);
        setTimeout(() => setAnalyzeFlash(false), 2000);
      }
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") {
        setDisplayData(analyzeLeadSpecs(specs));
        setAnalyzeFlash(true);
        setTimeout(() => setAnalyzeFlash(false), 2000);
      }
    } finally {
      if (!ac.signal.aborted) setAnalyzing(false);
    }
  }, [specs]);

  const columns: ColumnsType<PreviewRecord> = [
    {
      title: "Sr. No.",
      key: "sr",
      width: 72,
      align: "center",
      render: (_v, _r, index) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {index + 1}
        </Text>
      ),
    },
    { title: "Name", dataIndex: "name", key: "name", render: (v: string) => <Text strong>{v}</Text> },
    {
      title: "Company",
      dataIndex: "company",
      key: "company",
      render: (v: string) => <PartialBlurredCompany value={v} />,
    },
    { title: "Job Title", dataIndex: "jobTitle", key: "jobTitle" },
    { title: "Industry", dataIndex: "industry", key: "industry", render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: "Country", dataIndex: "country", key: "country" },
    { title: "Email", dataIndex: "email", key: "email", render: (v: string) => <BlurredCell value={v} /> },
    { title: "Phone", dataIndex: "phone", key: "phone", render: (v: string) => <BlurredCell value={v} /> },
  ];

  const fieldsBySection = useMemo(() => {
    const map: Record<string, SpecFieldType[]> = { geography: [], company: [], contact: [] };
    for (const def of SPEC_FIELD_DEFINITIONS) {
      map[def.section].push(def.type);
    }
    return map;
  }, []);

  return (
    <div style={{ maxWidth: 1280 }}>
      <style>{`
        .check-data-summary-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(15,23,42,0.1) !important;
        }
        @keyframes checkDataPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        .check-data-analyzing .ant-progress-bg {
          animation: checkDataPulse 1.2s ease-in-out infinite;
        }
        .check-data-spec-section {
          background: #fafbfc;
          border: 1px solid #eef2f6;
          border-radius: 12px;
          padding: 18px 20px;
        }
        .check-data-audience-card:hover {
          border-color: #c7d2fe;
          box-shadow: 0 2px 10px rgba(79, 70, 229, 0.08);
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 18,
            }}
          >
            <DatabaseOutlined />
          </div>
          <div>
            <Title level={3} style={{ margin: 0, fontWeight: 700 }}>
              Check Data
            </Title>
            <Text type="secondary">
              Define lead specifications and preview estimated match volume
            </Text>
          </div>
        </div>
      </div>

      {/* Specs Builder */}
      <Card
        title={
          <Space>
            <FilterOutlined style={{ color: "#4f46e5" }} />
            <span>Specs Builder</span>
            {activeFilterCount > 0 && (
              <Tag color="blue" style={{ borderRadius: 12, marginLeft: 4 }}>
                {activeChips.length} selected
              </Tag>
            )}
          </Space>
        }
        extra={
          activeChips.length > 0 ? (
            <Button type="text" icon={<ClearOutlined />} onClick={clearAll} danger>
              Clear all
            </Button>
          ) : null
        }
        style={{ borderRadius: 14, marginBottom: 20 }}
        styles={{ body: { padding: "20px 24px" } }}
      >
        <Row gutter={[20, 20]}>
          {(["geography", "company", "contact"] as const).map((section) => {
            const meta = SECTION_META[section];
            const fields = fieldsBySection[section];
            return (
              <Col xs={24} lg={12} key={section}>
                <div className="check-data-spec-section">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{ color: meta.color, fontSize: 16 }}>{meta.icon}</span>
                    <Text strong style={{ fontSize: 14, color: "#0f172a" }}>
                      {meta.title}
                    </Text>
                    {section === "geography" && (
                      <Tooltip title="State and city options update based on selected countries">
                        <EnvironmentOutlined style={{ color: "#94a3b8", fontSize: 13 }} />
                      </Tooltip>
                    )}
                  </div>
                  <Row gutter={[16, 16]}>
                    {fields.map((field) => (
                      <Col xs={24} sm={field === "country" ? 24 : 12} key={field}>
                        <SpecField
                          field={field}
                          specs={specs}
                          stateOptions={stateOptions}
                          cityOptions={cityOptions}
                          onChange={updateField}
                        />
                      </Col>
                    ))}
                  </Row>
                </div>
              </Col>
            );
          })}

          <Col xs={24}>
            <div className="check-data-spec-section">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span style={{ color: SECTION_META.custom.color, fontSize: 16 }}>
                  {SECTION_META.custom.icon}
                </span>
                <Text strong style={{ fontSize: 14, color: "#0f172a" }}>
                  {SECTION_META.custom.title}
                </Text>
              </div>
              <B2BSpecsBuilder entries={specs.b2b_specs} onChange={updateB2BSpecs} />
            </div>
          </Col>
        </Row>

        {activeChips.length > 0 && (
          <>
            <Divider style={{ margin: "20px 0 14px" }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <Text type="secondary" style={{ fontSize: 12, marginRight: 2 }}>
                Active filters
              </Text>
              {activeChips.map((chip) => (
                <Tag
                  key={`${chip.kind}-${chip.field}-${chip.value}-${chip.b2bEntryId ?? ""}`}
                  closable
                  onClose={() => removeChip(chip)}
                  style={{ borderRadius: 20, padding: "3px 10px", margin: 0 }}
                >
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {chip.label}:
                  </Text>{" "}
                  <strong>{chip.value}</strong>
                </Tag>
              ))}
            </div>
          </>
        )}

        {activeChips.length === 0 && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 16px",
              background: "#f0f7ff",
              borderRadius: 10,
              border: "1px dashed #c7d2fe",
            }}
          >
            <Text style={{ fontSize: 13, color: "#4338ca" }}>
              Tip: Use <strong>Company Profile</strong> for revenue & headcount. Use <strong>Add Spec Field</strong> below
              for intent topics, EHR stack, therapeutic area, payer mix, and other B2B-only filters.
            </Text>
          </div>
        )}
      </Card>

      {/* Search & Analyze */}
      <Card style={{ borderRadius: 14, marginBottom: 20 }} styles={{ body: { padding: "20px 24px" } }}>
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={14}>
            <Space direction="vertical" size={4}>
              <Text strong style={{ fontSize: 15 }}>
                Ready to analyze your specification?
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {activeChips.length === 0
                  ? "Add filter values for a refined estimate, or analyze the full available pool."
                  : `${activeChips.length} value${activeChips.length > 1 ? "s" : ""} selected — estimated ${formatLeadCount(displayData.matchingLeads)} matching leads`}
              </Text>
            </Space>
            {analyzing && (
              <div className="check-data-analyzing" style={{ marginTop: 12 }}>
                <Progress percent={100} showInfo={false} status="active" strokeColor="#4f46e5" />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {loadingMessage}
                </Text>
              </div>
            )}
          </Col>
          <Col xs={24} md={10} style={{ textAlign: "right" }}>
            <Button
              type="primary"
              size="large"
              icon={<SearchOutlined />}
              loading={analyzing}
              onClick={handleAnalyze}
              style={{
                borderRadius: 10,
                height: 48,
                paddingInline: 32,
                fontWeight: 600,
                boxShadow: "0 4px 14px rgba(79,70,229,0.35)",
              }}
            >
              Search &amp; Analyze
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Global Audience */}
      <Card
        title={
          <Space size={8}>
            <GlobalOutlined style={{ color: "#4f46e5" }} />
            <span>Global Audience</span>
            {!dataLoading && (
              <Tag color="geekblue" style={{ borderRadius: 12, margin: 0, fontWeight: 600 }}>
                {audienceTotalFormatted} total
              </Tag>
            )}
          </Space>
        }
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            {activeFilterCount === 0
              ? "Worldwide contact pool by function"
              : "Filtered estimate · shown in Lac"}
          </Text>
        }
        style={{ borderRadius: 14, marginBottom: 20 }}
        styles={{ body: { padding: "16px 20px 20px" } }}
      >
        <Row gutter={[10, 10]}>
          {audienceStats.map((stat) => (
            <Col xs={12} sm={8} md={6} lg={4} xl={4} key={stat.key}>
              <AudienceStatCard
                label={stat.label}
                value={stat.formatted}
                loading={dataLoading}
                highlighted={stat.highlighted}
              />
            </Col>
          ))}
        </Row>
      </Card>

      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <SummaryCard
            title="Matching Leads"
            value={displayData.matchingLeads}
            format={countCardFormat}
            icon={<TeamOutlined />}
            color="#4f46e5"
            bg="#eff6ff"
            loading={dataLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <SummaryCard
            title="Estimated Coverage"
            value={displayData.coveragePercent}
            format="percent"
            icon={<LineChartOutlined />}
            color="#7c3aed"
            bg="#f5f3ff"
            loading={dataLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <SummaryCard
            title="Available Companies"
            value={displayData.availableCompanies}
            format={countCardFormat}
            icon={<BankOutlined />}
            color="#16a34a"
            bg="#ecfdf5"
            loading={dataLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <SummaryCard
            title="Available Contacts"
            value={displayData.availableContacts}
            format={countCardFormat}
            icon={<UserOutlined />}
            color="#ea580c"
            bg="#fff7ed"
            loading={dataLoading}
          />
        </Col>
      </Row>

      {/* Data Preview Table */}
      <Card
        title={
          <Space>
            <span>Data Preview</span>
            {!dataLoading && <Tag color="default">{PREVIEW_ROW_COUNT} sample records</Tag>}
            {dataLoading && (
              <Tag color="processing" style={{ borderRadius: 12 }}>
                Loading...
              </Tag>
            )}
            {analyzeFlash && <Tag color="success">Analysis complete</Tag>}
          </Space>
        }
        extra={
          dataLoading ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {loadingMessage}
            </Text>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Sensitive fields blurred · Full access on unlock
            </Text>
          )
        }
        style={{ borderRadius: 14 }}
      >
        {dataLoading ? (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Progress
                percent={100}
                showInfo={false}
                status="active"
                strokeColor="#4f46e5"
                size="small"
              />
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
                {loadingMessage} (~{Math.round(estimatedDelayMs / 100) / 10}s)
              </Text>
            </div>
            <Skeleton active title={false} paragraph={{ rows: 12 }} />
          </div>
        ) : displayData.previewRecords.length > 0 ? (
          <Table
            columns={columns}
            dataSource={displayData.previewRecords}
            rowKey="id"
            pagination={false}
            size="middle"
            scroll={{ x: 960 }}
            footer={() => (
              <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
                <Tooltip title="Unlock full database access to load more records">
                  <Button disabled style={{ minWidth: 148, borderRadius: 8, fontWeight: 500 }}>
                    Load more
                  </Button>
                </Tooltip>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Showing {PREVIEW_ROW_COUNT} of {formatLeadCount(displayData.matchingLeads)} matching leads
                  </Text>
                </div>
              </div>
            )}
          />
        ) : (
          <Empty description="Add specifications and click Search & Analyze to preview data" />
        )}
      </Card>
    </div>
  );
}
