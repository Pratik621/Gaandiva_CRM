"use client";

import { useState, useEffect } from "react";
import dayjs from "dayjs";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  Form,
  Input,
  DatePicker,
  Select,
  Button,
  message,
  InputNumber,
  Row,
  Col,
  Upload,
  Alert,
  Space,
  Spin,
  Typography,
  Popconfirm,
} from "antd";
import {
  ArrowLeftOutlined,
  FileOutlined,
  InboxOutlined,
  PlusOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";
import type { UploadFile } from "antd";
import { CampaignQuestionsEditor } from "@/components/Campaigns/CampaignQuestionsEditor";
import {
  campaignQuestionsPayloadFromFormValues,
  campaignQuestionsToFormRows,
  normalizeCampaignQuestions,
} from "@/lib/campaign-questions";
import { MAX_CAMPAIGN_FILE_BYTES, MAX_CAMPAIGN_FILE_SIZE_MB } from "@/lib/campaign-file-upload-limits";
import { uploadCampaignFilesDirect } from "@/lib/campaign-file-direct-upload";
import { REVENUE_SIZE_OPTIONS } from "@/lib/campaign/revenue-size";

const { TextArea } = Input;
const { Dragger } = Upload;

const ACCEPT_FILE_TYPES =
  ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip,.jpg,.jpeg,.png,.gif,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip,image/*";

const EMPLOYEE_SIZE_OPTIONS = [
  { value: "2-11", label: "2-11" },
  { value: "11-50", label: "11-50" },
  { value: "51-200", label: "51-200" },
  { value: "200-500", label: "200-500" },
  { value: "500-1000", label: "500-1000" },
  { value: "1000-5000", label: "1000-5000" },
  { value: "5000-10000", label: "5000-10000" },
  { value: "10000+", label: "10000+" },
  { value: "All Emp", label: "All Emp" },
];

const DEFAULT_LEAD_TYPES = [
  { value: "AG", label: "AG" },
  { value: "CD", label: "CD" },
  { value: "CDQA", label: "CDQA" },
  { value: "Double Touch - Whitepaper", label: "Double Touch - Whitepaper" },
  { value: "HQL / BANT", label: "HQL / BANT" },
  { value: "Tele", label: "Tele" },
  { value: "Webinar", label: "Webinar" },
  { value: "Whitepaper", label: "Whitepaper" },
];

type CampaignFile = {
  id: string;
  file_name: string;
  file_size: number | null;
};

type LoadedCampaign = {
  id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  lead_type: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  cpl: number | null;
  total_allocation: number | null;
  geography: string | null;
  employee_size: string[] | null;
  revenue_size: string[] | null;
  industry: string | null;
  abm: boolean | null;
  seniority: string | null;
  job_function: string | null;
  creatives_url: string[] | null;
  lead_aggregated: string | null;
  weekly_call: string | null;
  weekly_report: string | null;
  additional_comments: string | null;
  assigned_team_leader_id: string | null;
  campaign_questions?: unknown;
};

export default function SalesCreateCampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editCampaignId = searchParams?.get("id")?.trim() || null;
  const isEditMode = Boolean(editCampaignId);
  const { hasRole, isInitialized } = useAuth();
  const hasSalesAccess =
    hasRole("sales") || hasRole("sales_manager") || hasRole("admin");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEditMode);
  const [leadTypeOptions, setLeadTypeOptions] = useState(DEFAULT_LEAD_TYPES);
  const [teamLeaders, setTeamLeaders] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [clients, setClients] = useState<{ id: string; company_name: string }[]>([]);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [existingFiles, setExistingFiles] = useState<CampaignFile[]>([]);
  const [removingFileId, setRemovingFileId] = useState<string | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!isInitialized) return;
    if (!hasSalesAccess) return;
    fetch("/api/sales/clients", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.clients) setClients(data.clients);
      })
      .catch(() => {});
  }, [isInitialized, hasSalesAccess]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!hasSalesAccess) return;
    fetch("/api/tl/team-leaders", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          message.warning("Could not load Team Leaders: " + (data.error || "Unknown error"));
          return;
        }
        setTeamLeaders(data.team_leaders ?? []);
      })
      .catch(() => message.warning("Could not load Team Leaders"));
  }, [isInitialized, hasSalesAccess]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!hasSalesAccess) {
      router.replace("/login");
      return;
    }
  }, [isInitialized, hasSalesAccess, router]);

  const clientNameFromUrl = searchParams?.get("client_name");
  useEffect(() => {
    if (isEditMode) return;
    if (clientNameFromUrl && form && clients.length > 0) {
      const match = clients.find((c) => c.company_name === clientNameFromUrl || c.company_name?.toLowerCase() === clientNameFromUrl?.toLowerCase());
      if (match) form.setFieldValue("client_id", match.id);
    }
  }, [clientNameFromUrl, form, clients, isEditMode]);

  useEffect(() => {
    if (!editCampaignId || !isInitialized || !hasSalesAccess) return;

    let cancelled = false;
    setPageLoading(true);

    fetch(`/api/tl/campaigns/${editCampaignId}?page=1&limit=1`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error as string);

        const campaign = data.campaign as LoadedCampaign;
        setExistingFiles((data.files ?? []) as CampaignFile[]);

        const leadTypesArray =
          typeof campaign.lead_type === "string"
            ? campaign.lead_type
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean)
            : [];

        if (leadTypesArray.length) {
          setLeadTypeOptions((prev) => {
            const existing = new Set(prev.map((o) => o.value));
            const extras = leadTypesArray
              .filter((v) => v && !existing.has(v))
              .map((v) => ({ value: v, label: v }));
            return extras.length ? [...prev, ...extras] : prev;
          });
        }

        form.setFieldsValue({
          client_id: campaign.client_id ?? undefined,
          name: campaign.name,
          description: campaign.description ?? "",
          lead_type: leadTypesArray.length ? leadTypesArray : undefined,
          start_date: campaign.start_date ? dayjs(campaign.start_date) : null,
          end_date: campaign.end_date ? dayjs(campaign.end_date) : null,
          status: campaign.status,
          cpl: campaign.cpl,
          total_allocation: campaign.total_allocation,
          geography: campaign.geography ?? "",
          employee_size: campaign.employee_size ?? undefined,
          revenue_size: campaign.revenue_size ?? undefined,
          industry: campaign.industry ?? "",
          abm: campaign.abm,
          seniority: campaign.seniority ?? "",
          job_function: campaign.job_function ?? "",
          creatives_url: campaign.creatives_url?.length ? campaign.creatives_url : undefined,
          lead_aggregated: campaign.lead_aggregated
            ? campaign.lead_aggregated.split(",").map((name) => name.trim()).filter(Boolean)
            : undefined,
          weekly_call: campaign.weekly_call ?? "",
          weekly_report: campaign.weekly_report ?? "",
          additional_comments: campaign.additional_comments ?? "",
          assigned_team_leader_id: campaign.assigned_team_leader_id ?? undefined,
          campaign_question_rows: campaignQuestionsToFormRows(
            normalizeCampaignQuestions(campaign.campaign_questions)
          ),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        message.error(err instanceof Error ? err.message : "Failed to load campaign");
        router.replace("/sales/campaigns");
      })
      .finally(() => {
        if (!cancelled) setPageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editCampaignId, isInitialized, hasSalesAccess, form, router]);

  const handleRemoveFile = async (fileId: string) => {
    if (!editCampaignId) return;
    setRemovingFileId(fileId);
    try {
      const res = await fetch(`/api/tl/campaigns/${editCampaignId}/files/${fileId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove file");
      }
      setExistingFiles((prev) => prev.filter((f) => f.id !== fileId));
      message.success("File removed");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to remove file");
    } finally {
      setRemovingFileId(null);
    }
  };

  const cpl = Form.useWatch("cpl", form);
  const totalAllocation = Form.useWatch("total_allocation", form);
  const calculatedRevenue = cpl != null && totalAllocation != null && Number(cpl) >= 0 && Number(totalAllocation) >= 0
    ? Number(cpl) * Number(totalAllocation)
    : null;

  const submit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const revenueBooked = values.cpl != null && values.total_allocation != null
        ? Number(values.cpl) * Number(values.total_allocation)
        : null;

      const leadTypeValue = Array.isArray(values.lead_type)
        ? values.lead_type.join(", ")
        : values.lead_type;

      const selectedClient = values.client_id
        ? clients.find((c) => c.id === values.client_id)
        : null;

      const payload = {
        client_name: selectedClient?.company_name ?? values.client_name,
        name: values.name,
        description: values.description?.trim() || null,
        lead_type: leadTypeValue,
        start_date: values.start_date?.format?.("YYYY-MM-DD") ?? null,
        end_date: values.end_date?.format?.("YYYY-MM-DD") ?? null,
        status: values.status ?? "draft",
        cpl: values.cpl,
        total_allocation: values.total_allocation,
        revenue: revenueBooked,
        booked: revenueBooked,
        geography: values.geography?.trim() || null,
        employee_size: values.employee_size,
        revenue_size: values.revenue_size,
        industry: values.industry?.trim() || null,
        abm: values.abm,
        seniority: values.seniority?.trim() || null,
        job_function: values.job_function?.trim() || null,
        creatives_url: values.creatives_url?.filter((u: string) => u?.trim()) || null,
        lead_aggregated: values.lead_aggregated
          ?.map((name: string) => name?.trim())
          .filter(Boolean)
          .join(", ") || null,
        weekly_call: values.weekly_call,
        weekly_report: values.weekly_report,
        additional_comments: values.additional_comments,
        assigned_team_leader_id: values.assigned_team_leader_id || null,
        campaign_questions: campaignQuestionsPayloadFromFormValues(
          values as Record<string, unknown>
        ),
      };

      const res = await fetch(
        isEditMode ? `/api/tl/campaigns/${editCampaignId}` : "/api/tl/campaigns/create",
        {
          method: isEditMode ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(
            isEditMode
              ? payload
              : {
                  ...payload,
                  client_id: values.client_id || undefined,
                }
          ),
        }
      );

      // Safe JSON parse — proxy errors (413, 502 etc.) return plain text
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => "");
        throw new Error(
          res.status === 409
            ? "A campaign with this name already exists. Please choose a different name."
            : text || `Server error (${res.status})`
        );
      }
      if (!res.ok) {
        throw new Error(
          (data.error as string) ||
            (isEditMode ? "Failed to update campaign" : "Failed to create campaign")
        );
      }

      const campaignId = isEditMode
        ? editCampaignId!
        : (data.campaign_id as string);
      const filesToUpload = fileList
        .filter((f) => f.originFileObj)
        .map((f) => f.originFileObj as File);

      if (filesToUpload.length > 0) {
        const { errors: uploadErrors } = await uploadCampaignFilesDirect(
          `/api/tl/campaigns/${campaignId}/files`,
          filesToUpload
        );
        if (uploadErrors.length) {
          message.warning(
            `Campaign ${isEditMode ? "updated" : "created"}. Some files failed: ${uploadErrors.slice(0, 2).join("; ")}`
          );
        }
      }

      message.success(isEditMode ? "Campaign updated" : "Campaign created");
      router.replace(`/sales/campaigns/${campaignId}`);
    } catch (err) {
      message.error(
        err instanceof Error
          ? err.message
          : isEditMode
            ? "Failed to update campaign"
            : "Failed to create campaign"
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isInitialized || pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: "0 24px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        onClick={() =>
          router.push(isEditMode && editCampaignId ? `/sales/campaigns/${editCampaignId}` : "/sales/campaigns")
        }
        style={{ paddingLeft: 0, marginBottom: 16 }}
      >
        {isEditMode ? "Back to campaign" : "Back to campaigns"}
      </Button>

      {!isEditMode && clients.length === 0 && (
        <Alert
          type="info"
          showIcon
          message="No clients yet"
          description={
            <>
              Add at least one client before creating a campaign.{" "}
              <Button type="link" size="small" onClick={() => router.push("/sales/clients")} style={{ padding: 0 }}>
                Go to Clients
              </Button>
            </>
          }
          style={{ marginBottom: 24 }}
        />
      )}
      <Card title={isEditMode ? "Edit Campaign" : "Create Campaign"} style={{ marginBottom: 24 }}>
        <Form form={form} layout="vertical" initialValues={{ status: "draft" }}>
          <Row gutter={24}>
            <Col xs={24} md={12} lg={8}>
              <Form.Item
                name="client_id"
                label="Client Name"
                rules={[{ required: true, message: "Select a client" }]}
              >
                <Select
                  placeholder="Select client"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={clients.map((c) => ({ value: c.id, label: c.company_name }))}
                  notFoundContent={clients.length === 0 ? "No clients yet. Add a client first." : null}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="name" label="Campaign Name" rules={[{ required: true, message: "Campaign Name is required" }]}>
                <Input placeholder="Enter campaign name" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="lead_type" label="Lead Type">
                <Select
                  mode="tags"
                  maxTagCount="responsive"
                  placeholder="Select or type lead types"
                  allowClear
                  options={leadTypeOptions}
                  tokenSeparators={[","]}
                  onChange={(vals) => {
                    const arr = Array.isArray(vals) ? vals : [];
                    setLeadTypeOptions((prev) => {
                      const existing = new Set(prev.map((o) => o.value));
                      const extras = arr
                        .map((v) => String(v).trim())
                        .filter((v) => v && !existing.has(v))
                        .map((v) => ({ value: v, label: v }));
                      return extras.length ? [...prev, ...extras] : prev;
                    });
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col span={24}>
              <Form.Item name="description" label="Overview (Description)">
                <TextArea rows={3} placeholder="Campaign objective / brief" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col xs={24}>
              <Form.Item label="Aggregator Name">
                <Form.List name="lead_aggregated">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map(({ key, name, ...restField }) => (
                        <Space key={key} style={{ display: "flex", marginBottom: 8 }} align="baseline">
                          <Form.Item
                            {...restField}
                            name={[name]}
                            rules={[{ required: true, whitespace: true, message: "Enter an aggregator name" }]}
                            style={{ flex: 1, marginBottom: 0, minWidth: 200 }}
                          >
                            <Input placeholder="Enter aggregator name" />
                          </Form.Item>
                          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                        </Space>
                      ))}
                      <Form.Item style={{ marginBottom: 0 }}>
                        <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                          Create Aggregator
                        </Button>
                      </Form.Item>
                    </>
                  )}
                </Form.List>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="start_date" label="Start Date">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="end_date" label="End Date">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: "draft", label: "Draft" },
                    { value: "active", label: "Active" },
                    { value: "paused", label: "Paused" },
                    { value: "completed", label: "Completed" },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Form.Item name="cpl" label="CPL (Cost Per Lead)">
                <InputNumber style={{ width: "100%" }} placeholder="e.g. 25.00" min={0} step={0.01} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Form.Item name="total_allocation" label="Total Allocation">
                <InputNumber style={{ width: "100%" }} placeholder="e.g. 1000" min={0} precision={0} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Form.Item label="Revenue / Booked (auto)">
                <div style={{ padding: "4px 11px", minHeight: 32, lineHeight: "22px", background: "#fafafa", borderRadius: 6, border: "1px solid #d1d5db", color: calculatedRevenue != null ? "inherit" : "#999" }}>
                  {calculatedRevenue != null ? `$${Number(calculatedRevenue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                </div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>CPL × Total Allocation</div>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col xs={24}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#262626" }}>Targeting</div>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="employee_size" label="Employee Size">
                <Select
                  mode="multiple"
                  placeholder="Select employee size ranges"
                  allowClear
                  options={EMPLOYEE_SIZE_OPTIONS}
                  style={{ width: "100%" }}
                  maxTagCount="responsive"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="revenue_size" label="Revenue Size">
                <Select
                  mode="multiple"
                  placeholder="Select revenue size ranges"
                  allowClear
                  options={[...REVENUE_SIZE_OPTIONS]}
                  style={{ width: "100%" }}
                  maxTagCount="responsive"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="industry" label="Industry">
                <Input placeholder="e.g. Technology, Healthcare, Finance" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="abm" label="ABM">
                <Select placeholder="Yes / No" allowClear options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="seniority" label="Seniority">
                <Input placeholder="e.g. C-Level, VP, Director, Manager" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="job_function" label="Job Function">
                <Input placeholder="e.g. Sales, Marketing, Engineering" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col xs={24}>
              <Form.Item label="Creatives URL">
                <Form.List name="creatives_url">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map(({ key, name, ...restField }) => (
                        <Space key={key} style={{ display: "flex", marginBottom: 8 }} align="baseline">
                          <Form.Item {...restField} name={[name]} rules={[{ type: "url", message: "Enter a valid URL" }]} style={{ flex: 1, marginBottom: 0, minWidth: 200 }}>
                            <Input placeholder="https://..." />
                          </Form.Item>
                          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                        </Space>
                      ))}
                      <Form.Item style={{ marginBottom: 0 }}>
                        <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                          Add URL
                        </Button>
                      </Form.Item>
                    </>
                  )}
                </Form.List>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="assigned_team_leader_id" label="Assign Team Leader">
                <Select
                  placeholder="Select Team Leader"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={teamLeaders.map((tl) => ({
                    value: tl.id,
                    label: tl.full_name || tl.email || tl.id,
                  }))}
                  notFoundContent={teamLeaders.length === 0 ? "No Team Leaders found" : undefined}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="geography" label="Geography">
                <Input placeholder="e.g. North America, APAC, EMEA" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item name="weekly_call" label="Weekly Call">
                <Input placeholder="e.g. Monday 10:00 AM" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="weekly_report" label="Weekly Report">
                <Input placeholder="e.g. Friday EOD" />
              </Form.Item>
            </Col>
          </Row>

          <CampaignQuestionsEditor />

          <Row gutter={24}>
            <Col span={24}>
              <Form.Item
                label="Upload Files"
                tooltip={`PDF, Word, Excel, PowerPoint, CSV, images, ZIP, etc. Max ${MAX_CAMPAIGN_FILE_SIZE_MB}MB per file.`}
              >
                {isEditMode && existingFiles.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                      Existing files
                    </Typography.Text>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {existingFiles.map((f) => (
                        <li
                          key={f.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 0",
                            borderBottom: "1px solid #f0f0f0",
                          }}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                            <FileOutlined />
                            {f.file_name}
                            {f.file_size != null && (
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                ({(f.file_size / 1024).toFixed(1)} KB)
                              </Typography.Text>
                            )}
                          </span>
                          <Popconfirm
                            title="Remove this file?"
                            onConfirm={() => handleRemoveFile(f.id)}
                            okText="Remove"
                            okType="danger"
                          >
                            <Button
                              type="link"
                              size="small"
                              danger
                              loading={removingFileId === f.id}
                              disabled={!!removingFileId}
                            >
                              Remove
                            </Button>
                          </Popconfirm>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Dragger
                  multiple
                  fileList={fileList}
                  accept={ACCEPT_FILE_TYPES}
                  beforeUpload={(file) => {
                    if (file.size > MAX_CAMPAIGN_FILE_BYTES) {
                      message.error(`Each file must be ${MAX_CAMPAIGN_FILE_SIZE_MB}MB or smaller.`);
                      return Upload.LIST_IGNORE;
                    }
                    return false;
                  }}
                  onRemove={(file) => setFileList((prev) => prev.filter((f) => f.uid !== file.uid))}
                  onChange={({ fileList: next }) => setFileList(next)}
                  maxCount={20}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined style={{ fontSize: 48, color: "#4f46e5" }} />
                  </p>
                  <p className="ant-upload-text">Click or drag files to upload</p>
                  <p className="ant-upload-hint">
                    PDF, Word (.doc, .docx), Excel (.xls, .xlsx), CSV, PowerPoint (.ppt, .pptx), text, images, ZIP. Multiple files allowed.
                  </p>
                </Dragger>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col span={24}>
              <Form.Item name="additional_comments" label="Additional Comments">
                <TextArea rows={4} placeholder="Any additional notes or comments" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
            <Space>
              <Button type="primary" size="large" loading={loading} onClick={submit}>
                {isEditMode ? "Save Campaign" : "Create Campaign"}
              </Button>
              <Button
                size="large"
                onClick={() =>
                  router.push(
                    isEditMode && editCampaignId ? `/sales/campaigns/${editCampaignId}` : "/sales/campaigns"
                  )
                }
              >
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
