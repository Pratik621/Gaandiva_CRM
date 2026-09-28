"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Collapse,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import { RocketOutlined, SaveOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FETCH_COUNT_WARN_THRESHOLD,
  MAX_FETCH_COUNT,
  estimateCostUsd,
  validateFilters,
  type LeadFinderFilters,
} from "@/lib/lead-finder/types";
import { COMPANY_INDUSTRY_OPTIONS } from "@/lib/lead-finder/industries";
import {
  COMPANY_SIZE_SELECT_OPTIONS,
  EMAIL_STATUS_SELECT_OPTIONS,
  FUNCTIONAL_OPTIONS,
  FUNDING_OPTIONS,
  LOCATION_OPTIONS,
  REVENUE_OPTIONS,
  SENIORITY_OPTIONS,
} from "@/lib/lead-finder/options";

const { Text } = Typography;

type TemplateRow = { id: string; name: string; filters: LeadFinderFilters; created_at: string };

type FormShape = {
  contact_job_title: string[];
  contact_not_job_title: string[];
  seniority_level: string[];
  functional_level: string[];
  contact_location: string[];
  contact_city: string[];
  contact_not_location: string[];
  contact_not_city: string[];
  email_status: string[];
  company_domain: string[];
  size: string[];
  company_industry: string[];
  company_not_industry: string[];
  company_keywords: string[];
  company_not_keywords: string[];
  min_revenue?: string;
  max_revenue?: string;
  funding: string[];
  fetch_count: number;
  file_name: string;
};

const EMPTY_FORM: FormShape = {
  contact_job_title: [],
  contact_not_job_title: [],
  seniority_level: [],
  functional_level: [],
  contact_location: ["united states"],
  contact_city: [],
  contact_not_location: [],
  contact_not_city: [],
  email_status: ["validated"],
  company_domain: [],
  size: [],
  company_industry: [],
  company_not_industry: [],
  company_keywords: [],
  company_not_keywords: [],
  min_revenue: undefined,
  max_revenue: undefined,
  funding: [],
  fetch_count: 100,
  file_name: "",
};

const ARRAY_KEYS = [
  "contact_job_title",
  "contact_not_job_title",
  "seniority_level",
  "functional_level",
  "contact_location",
  "contact_city",
  "contact_not_location",
  "contact_not_city",
  "email_status",
  "company_domain",
  "size",
  "company_industry",
  "company_not_industry",
  "company_keywords",
  "company_not_keywords",
  "funding",
] as const;

function formToFilters(values: FormShape): Record<string, unknown> {
  const out: Record<string, unknown> = {
    fetch_count: values.fetch_count,
    file_name: values.file_name,
  };
  for (const key of ARRAY_KEYS) {
    if (values[key]?.length) out[key] = values[key];
  }
  if (values.min_revenue) out.min_revenue = values.min_revenue;
  if (values.max_revenue) out.max_revenue = values.max_revenue;
  return out;
}

/** Tag-style multi input: type + Enter, comma-paste supported. */
function TagInput(props: {
  value?: string[];
  onChange?: (v: string[]) => void;
  placeholder: string;
  negative?: boolean;
}) {
  return (
    <Select
      mode="tags"
      value={props.value}
      onChange={(v) => {
        const expanded = [
          ...new Set(
            (v as string[]).flatMap((item) => item.split(",").map((s) => s.trim())).filter(Boolean)
          ),
        ];
        props.onChange?.(expanded);
      }}
      placeholder={props.placeholder}
      tokenSeparators={[","]}
      open={false}
      suffixIcon={null}
      tagRender={
        props.negative
          ? (tagProps) => (
              <Tag
                color="red"
                closable={tagProps.closable}
                onClose={tagProps.onClose}
                style={{ marginInlineEnd: 4 }}
              >
                {tagProps.label}
              </Tag>
            )
          : undefined
      }
      style={{ width: "100%" }}
    />
  );
}

/** Section header with an active-filter count badge. */
function PanelHeader({ emoji, title, count }: { emoji: string; title: string; count: number }) {
  return (
    <Space size={8}>
      <span>{emoji}</span>
      <Text strong>{title}</Text>
      {count > 0 ? <Badge count={count} color="#4f46e5" size="small" /> : null}
    </Space>
  );
}

export default function FilterForm({ onStarted }: { onStarted: (runId: string) => void }) {
  const [form] = Form.useForm<FormShape>();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"form" | "json">("form");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFilters, setPendingFilters] = useState<LeadFinderFilters | null>(null);
  const [starting, setStarting] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const watched = Form.useWatch([], form) as FormShape | undefined;
  const fetchCount = watched?.fetch_count ?? 0;

  const counts = useMemo(() => {
    const v = watched ?? EMPTY_FORM;
    return {
      job:
        (v.contact_job_title?.length ?? 0) +
        (v.contact_not_job_title?.length ?? 0) +
        (v.seniority_level?.length ?? 0) +
        (v.functional_level?.length ?? 0),
      locIn: (v.contact_location?.length ?? 0) + (v.contact_city?.length ?? 0),
      locEx: (v.contact_not_location?.length ?? 0) + (v.contact_not_city?.length ?? 0),
      email: v.email_status?.length ?? 0,
      domain: v.company_domain?.length ?? 0,
      size: v.size?.length ?? 0,
      industry: (v.company_industry?.length ?? 0) + (v.company_not_industry?.length ?? 0),
      keywords: (v.company_keywords?.length ?? 0) + (v.company_not_keywords?.length ?? 0),
      revenue: (v.min_revenue ? 1 : 0) + (v.max_revenue ? 1 : 0) + (v.funding?.length ?? 0),
    };
  }, [watched]);

  const templatesQuery = useQuery({
    queryKey: ["lead-finder", "templates"],
    queryFn: async () => {
      const res = await fetch("/api/admin/lead-finder/templates", { credentials: "include" });
      const json = (await res.json()) as { templates?: TemplateRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load templates");
      return json.templates ?? [];
    },
    staleTime: 60_000,
  });

  const collectFilters = async (): Promise<LeadFinderFilters | null> => {
    if (mode === "json") {
      try {
        const parsed = JSON.parse(jsonText || "{}");
        const validation = validateFilters(parsed);
        if (!validation.filters) {
          setJsonError(validation.errors.join("; "));
          return null;
        }
        setJsonError(null);
        return validation.filters;
      } catch (err) {
        setJsonError(err instanceof Error ? `JSON parse error: ${err.message}` : "Invalid JSON");
        return null;
      }
    }
    try {
      const values = await form.validateFields();
      const validation = validateFilters(formToFilters(values));
      if (!validation.filters) {
        message.error(validation.errors.join("; "));
        return null;
      }
      return validation.filters;
    } catch {
      return null;
    }
  };

  const handleModeChange = async (next: string) => {
    if (next === "json" && mode === "form") {
      const values = form.getFieldsValue();
      setJsonText(JSON.stringify(formToFilters(values as FormShape), null, 2));
      setJsonError(null);
    }
    if (next === "form" && mode === "json") {
      try {
        const parsed = JSON.parse(jsonText || "{}");
        const validation = validateFilters(parsed);
        if (validation.filters) {
          form.setFieldsValue({ ...EMPTY_FORM, ...validation.filters } as FormShape);
          setJsonError(null);
        } else {
          setJsonError(validation.errors.join("; "));
          return;
        }
      } catch (err) {
        setJsonError(err instanceof Error ? `JSON parse error: ${err.message}` : "Invalid JSON");
        return;
      }
    }
    setMode(next as "form" | "json");
  };

  const handleStartClick = async () => {
    const filters = await collectFilters();
    if (!filters) return;
    setPendingFilters(filters);
    setConfirmOpen(true);
  };

  const handleConfirmStart = async () => {
    if (!pendingFilters) return;
    setStarting(true);
    try {
      const res = await fetch("/api/admin/lead-finder/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: pendingFilters }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        run_id?: string;
        error?: string;
        details?: string[];
      };
      if (!res.ok || !json.run_id) {
        message.error(json.details?.join("; ") ?? json.error ?? "Failed to start search");
        return;
      }
      message.success("AI agent launched — hunting leads now 🚀");
      setConfirmOpen(false);
      onStarted(json.run_id);
    } catch {
      message.error("Failed to start search");
    } finally {
      setStarting(false);
    }
  };

  const handleSaveTemplate = async () => {
    const filters = await collectFilters();
    if (!filters) return;
    const name = templateName.trim() || filters.file_name;
    try {
      const res = await fetch("/api/admin/lead-finder/templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, filters }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        message.error(json.error ?? "Failed to save template");
        return;
      }
      message.success(`Template "${name}" saved`);
      setTemplateName("");
      void queryClient.invalidateQueries({ queryKey: ["lead-finder", "templates"] });
    } catch {
      message.error("Failed to save template");
    }
  };

  const loadTemplate = (id: string) => {
    const template = (templatesQuery.data ?? []).find((t) => t.id === id);
    if (!template) return;
    form.setFieldsValue({ ...EMPTY_FORM, ...template.filters } as FormShape);
    setJsonText(JSON.stringify(template.filters, null, 2));
    setJsonError(null);
    message.success(`Loaded "${template.name}"`);
  };

  const estimated = useMemo(
    () => estimateCostUsd(pendingFilters?.fetch_count ?? fetchCount),
    [pendingFilters, fetchCount]
  );

  const searchable = { showSearch: true, optionFilterProp: "label" as const };

  const collapseItems = [
    {
      key: "job",
      label: <PanelHeader emoji="💼" title="Job Title" count={counts.job} />,
      children: (
        <div className="lf-grid">
          <Form.Item name="contact_job_title" label="Include job titles">
            <TagInput placeholder="e.g. Practice Owner, Practice Manager — type & Enter" />
          </Form.Item>
          <Form.Item name="contact_not_job_title" label="Exclude job titles">
            <TagInput placeholder="e.g. Assistant, Intern" negative />
          </Form.Item>
          <Form.Item name="seniority_level" label="Seniority level">
            <Select mode="multiple" {...searchable} placeholder="Any seniority" options={SENIORITY_OPTIONS} maxTagCount="responsive" />
          </Form.Item>
          <Form.Item name="functional_level" label="Functional level">
            <Select mode="multiple" {...searchable} placeholder="Any function" options={FUNCTIONAL_OPTIONS} maxTagCount="responsive" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: "loc-in",
      label: <PanelHeader emoji="📍" title="Location (Include)" count={counts.locIn} />,
      children: (
        <div className="lf-grid">
          <Form.Item name="contact_location" label="Region / Country / State">
            <Select
              mode="multiple"
              {...searchable}
              placeholder="Search locations…"
              options={LOCATION_OPTIONS.map((v) => ({ value: v, label: v }))}
              maxTagCount="responsive"
            />
          </Form.Item>
          <Form.Item name="contact_city" label="City" tooltip="Leave Region empty when targeting a specific city">
            <TagInput placeholder="e.g. Mumbai, Austin — type & Enter" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: "loc-ex",
      label: <PanelHeader emoji="🚫" title="Location (Exclude)" count={counts.locEx} />,
      children: (
        <div className="lf-grid">
          <Form.Item name="contact_not_location" label="Region / Country / State">
            <Select
              mode="multiple"
              {...searchable}
              placeholder="Exclude locations…"
              options={LOCATION_OPTIONS.map((v) => ({ value: v, label: v }))}
              maxTagCount="responsive"
            />
          </Form.Item>
          <Form.Item name="contact_not_city" label="City">
            <TagInput placeholder="Exclude cities" negative />
          </Form.Item>
        </div>
      ),
    },
    {
      key: "email",
      label: <PanelHeader emoji="✉️" title="Email Status" count={counts.email} />,
      children: (
        <Form.Item name="email_status" label="Only include leads with email status">
          <Select mode="multiple" options={EMAIL_STATUS_SELECT_OPTIONS} placeholder="Any status" style={{ maxWidth: 420 }} />
        </Form.Item>
      ),
    },
    {
      key: "domain",
      label: <PanelHeader emoji="🌐" title="Company Website" count={counts.domain} />,
      children: (
        <Form.Item name="company_domain" label="Include company websites / domains">
          <TagInput placeholder="e.g. google.com, https://apple.com" />
        </Form.Item>
      ),
    },
    {
      key: "size",
      label: <PanelHeader emoji="👥" title="Company Size" count={counts.size} />,
      children: (
        <Form.Item name="size">
          {/* Children (not options) so the grid controls layout — AntD's own
              option wrappers add uneven margins that break column alignment. */}
          <Checkbox.Group style={{ width: "100%" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: "10px 16px",
                width: "100%",
              }}
            >
              {COMPANY_SIZE_SELECT_OPTIONS.map((s) => (
                <Checkbox key={s} value={s} style={{ marginInlineStart: 0, whiteSpace: "nowrap" }}>
                  {s}
                </Checkbox>
              ))}
            </div>
          </Checkbox.Group>
        </Form.Item>
      ),
    },
    {
      key: "industry",
      label: <PanelHeader emoji="🏭" title="Industry" count={counts.industry} />,
      children: (
        <div className="lf-grid">
          <Form.Item name="company_industry" label="Include any of these industries">
            <Select
              mode="multiple"
              {...searchable}
              placeholder="Search industries…"
              options={COMPANY_INDUSTRY_OPTIONS.map((v) => ({ value: v, label: v }))}
              maxTagCount="responsive"
            />
          </Form.Item>
          <Form.Item name="company_not_industry" label="Exclude any of these industries">
            <Select
              mode="multiple"
              {...searchable}
              placeholder="Exclude industries…"
              options={COMPANY_INDUSTRY_OPTIONS.map((v) => ({ value: v, label: v }))}
              maxTagCount="responsive"
            />
          </Form.Item>
        </div>
      ),
    },
    {
      key: "keywords",
      label: <PanelHeader emoji="🔑" title="Keywords" count={counts.keywords} />,
      children: (
        <div className="lf-grid">
          <Form.Item name="company_keywords" label="Include these keywords">
            <TagInput placeholder="e.g. Cardiology, Med Spa, Urgent Care — comma-paste works" />
          </Form.Item>
          <Form.Item name="company_not_keywords" label="Exclude these keywords">
            <TagInput placeholder="e.g. Hospital, Health System" negative />
          </Form.Item>
        </div>
      ),
    },
    {
      key: "revenue",
      label: <PanelHeader emoji="💰" title="Revenue & Funding" count={counts.revenue} />,
      children: (
        <div className="lf-grid">
          <Form.Item name="min_revenue" label="Minimum revenue">
            <Select allowClear placeholder="Any" options={REVENUE_OPTIONS.map((v) => ({ value: v, label: `$${v}` }))} />
          </Form.Item>
          <Form.Item name="max_revenue" label="Maximum revenue">
            <Select allowClear placeholder="Any" options={REVENUE_OPTIONS.map((v) => ({ value: v, label: `$${v}` }))} />
          </Form.Item>
          <Form.Item name="funding" label="Funding round">
            <Select mode="multiple" {...searchable} placeholder="Any funding stage" options={FUNDING_OPTIONS} maxTagCount="responsive" />
          </Form.Item>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`.lf-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 0 20px; }`}</style>

      <Space wrap>
        <Select
          placeholder="Load template…"
          style={{ width: 260 }}
          loading={templatesQuery.isLoading}
          options={(templatesQuery.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          onChange={loadTemplate}
          allowClear
        />
        <Input
          placeholder="Template name (optional)"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          style={{ width: 200 }}
        />
        <Button icon={<SaveOutlined />} onClick={() => void handleSaveTemplate()}>
          Save as template
        </Button>
      </Space>

      <Tabs
        activeKey={mode}
        onChange={(k) => void handleModeChange(k)}
        items={[
          {
            key: "form",
            label: "Form Mode",
            children: (
              <Form<FormShape> form={form} layout="vertical" initialValues={EMPTY_FORM}>
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    flexWrap: "wrap",
                    padding: "16px 16px 0",
                    background: "linear-gradient(135deg, #eef2ff 0%, #faf5ff 100%)",
                    borderRadius: 12,
                    marginBottom: 16,
                  }}
                >
                  <Form.Item
                    name="fetch_count"
                    label={<Text strong>#️⃣ Number of leads</Text>}
                    rules={[
                      { required: true, message: "Required" },
                      {
                        type: "number",
                        min: 1,
                        max: MAX_FETCH_COUNT,
                        message: `Must be between 1 and ${MAX_FETCH_COUNT}`,
                      },
                    ]}
                    getValueFromEvent={(value) => {
                      if (value === null || value === undefined || value === "") return value;
                      const n = typeof value === "number" ? value : Number(value);
                      if (!Number.isFinite(n)) return value;
                      return Math.min(MAX_FETCH_COUNT, Math.max(1, Math.floor(n)));
                    }}
                    extra={
                      <Text
                        type={fetchCount > FETCH_COUNT_WARN_THRESHOLD ? "warning" : "secondary"}
                        style={{ fontSize: 12 }}
                      >
                        Max {MAX_FETCH_COUNT.toLocaleString()} leads · Estimated cost ≈ $
                        {estimateCostUsd(fetchCount)}
                        {fetchCount > FETCH_COUNT_WARN_THRESHOLD
                          ? " — large run, this will consume real credits"
                          : " (~$2 per 1,000 leads)"}
                      </Text>
                    }
                  >
                    <InputNumber
                      min={1}
                      max={MAX_FETCH_COUNT}
                      step={1}
                      precision={0}
                      controls
                      style={{ width: 170 }}
                    />
                  </Form.Item>
                  <Form.Item
                    name="file_name"
                    label={<Text strong>📁 File / List name</Text>}
                    style={{ flex: 1, minWidth: 280 }}
                    rules={[{ required: true, whitespace: true, message: "Required — used as the batch name" }]}
                  >
                    <Input placeholder='e.g. "Clinical Specialties - Clinics US (25-100)"' />
                  </Form.Item>
                </div>

                <Collapse
                  items={collapseItems}
                  defaultActiveKey={["job", "loc-in", "industry", "keywords"]}
                  bordered={false}
                  style={{ background: "transparent" }}
                />
              </Form>
            ),
          },
          {
            key: "json",
            label: "JSON Mode",
            children: (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Input.TextArea
                  rows={16}
                  value={jsonText}
                  onChange={(e) => {
                    setJsonText(e.target.value);
                    setJsonError(null);
                  }}
                  placeholder='Paste the client filter JSON here, e.g. {"company_industry": [...], "fetch_count": 100, "file_name": "..."}'
                  style={{ fontFamily: "monospace", fontSize: 13 }}
                />
                {jsonError ? <Alert type="error" showIcon message={jsonError} /> : null}
              </div>
            ),
          },
        ]}
      />

      <div>
        <Button
          type="primary"
          size="large"
          icon={<RocketOutlined />}
          onClick={() => void handleStartClick()}
          style={{
            background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
            border: "none",
            height: 44,
            paddingInline: 28,
            fontWeight: 600,
          }}
        >
          Launch AI Search
        </Button>
      </div>

      <Modal
        open={confirmOpen}
        title="🤖 Launch the lead-finding agent?"
        okText={`Launch (~$${estimated})`}
        confirmLoading={starting}
        onOk={() => void handleConfirmStart()}
        onCancel={() => setConfirmOpen(false)}
      >
        {pendingFilters ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Text>
              Batch: <Text strong>{pendingFilters.file_name}</Text>
            </Text>
            <Text>
              Leads to fetch: <Text strong>{pendingFilters.fetch_count.toLocaleString()}</Text> ·
              Estimated cost: <Text strong>${estimated}</Text>
            </Text>
            <pre
              style={{
                background: "#f8fafc",
                padding: 12,
                borderRadius: 8,
                fontSize: 12,
                maxHeight: 240,
                overflow: "auto",
              }}
            >
              {JSON.stringify(pendingFilters, null, 2)}
            </pre>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
