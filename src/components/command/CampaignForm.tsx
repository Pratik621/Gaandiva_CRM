"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Button,
  message,
  Row,
  Col,
  Divider,
  Upload,
  Typography,
  Space,
} from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import { UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useAuth } from "@/context/AuthContext";
import { uploadCampaignFilesDirect } from "@/lib/campaign-file-direct-upload";
import { CampaignQuestionsEditor } from "@/components/Campaigns/CampaignQuestionsEditor";
import {
  campaignQuestionsPayloadFromFormValues,
  campaignQuestionsToFormRows,
  DEMAND_QUALIFICATION_INSIGHTS_LABEL,
  normalizeCampaignQuestions,
} from "@/lib/campaign-questions";
import { REVENUE_SIZE_OPTIONS } from "@/lib/campaign/revenue-size";

interface CampaignFormValues {
  campaign_id: string;
  name: string;
  campaign_type?: string | null;
  description?: string | null;
  industry?: string | null;
  geography?: string | null;
  revenue_size?: string[] | null;
  lead_type?: string | null;
  client_name?: string | null;
  client_id?: string | null;
  start_date?: string | Dayjs | null;
  end_date?: string | Dayjs | null;
  status?: string;
  cpl?: number | null;
  revenue?: number | null;
  total_allocation?: number | null;
  sponsor_name?: string | null;
  lead_aggregated?: string | null;
  total_leads_allocated?: number | null;
  total_campaign_spend?: number | null;
  total_leads_delivered?: number | null;
  daily_reporting?: string | null;
  channel_split?: string | null;
  deficit_leads?: number | null;
  lead_increment?: number | null;
  lead_replace?: number | null;
  imported_leads_file?: UploadFile[];
}

interface CampaignFormProps {
  initialValues?: Partial<CampaignFormValues>;
  campaignId?: string;
  onSuccess?: (campaign: Record<string, unknown>) => void;
  onCancel?: () => void;
}

export default function CampaignForm({
  initialValues,
  campaignId,
  onSuccess,
  onCancel,
}: CampaignFormProps) {
  const { profile, hasRole } = useAuth();
  const canPickAnyClient =
    hasRole("internal_operator") || hasRole("internal_admin") || hasRole("admin");
  const isClientViewer = hasRole("client_viewer");
  const clientScopedToProfile = isClientViewer && !canPickAnyClient;

  const [form] = Form.useForm<CampaignFormValues>();
  const [loading, setLoading] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientOptions, setClientOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadFile[]>([]);
  const isEdit = Boolean(campaignId);

  const watchedCpl = Form.useWatch("cpl", form);
  const watchedAllocation = Form.useWatch("total_allocation", form);

  useEffect(() => {
    const cpl = watchedCpl ?? 0;
    const allocation = watchedAllocation ?? 0;
    form.setFieldValue("revenue", cpl * allocation);
  }, [watchedCpl, watchedAllocation, form]);

  const normalizedInitialValues = useMemo(() => {
    if (!initialValues) return initialValues;
    const campaignQuestions = normalizeCampaignQuestions(
      (initialValues as { campaign_questions?: unknown }).campaign_questions
    );
    return {
      ...initialValues,
      campaign_question_rows: campaignQuestionsToFormRows(campaignQuestions),
      start_date: initialValues.start_date ? dayjs(initialValues.start_date as string) : null,
      end_date: initialValues.end_date ? dayjs(initialValues.end_date as string) : null,
      daily_reporting:
        typeof initialValues.daily_reporting === "object" && initialValues.daily_reporting !== null
          ? JSON.stringify(initialValues.daily_reporting, null, 2)
          : (initialValues.daily_reporting as string | null | undefined),
      channel_split:
        typeof initialValues.channel_split === "object" && initialValues.channel_split !== null
          ? JSON.stringify(initialValues.channel_split, null, 2)
          : (initialValues.channel_split as string | null | undefined),
    };
  }, [initialValues]);

  useEffect(() => {
    const loadClients = async () => {
      setClientsLoading(true);
      try {
        const res = await fetch("/api/sales/clients");
        const data = (await res.json()) as {
          clients?: Array<{ id: string; company_name?: string | null }>;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Failed to load clients");
        let list = (data.clients ?? []).map((c) => ({
          value: c.id,
          label: c.company_name ?? c.id,
        }));
        if (clientScopedToProfile && profile?.client_id) {
          list = list.filter((c) => c.value === profile.client_id);
        }
        setClientOptions(list);
      } catch {
        message.error("Failed to load client list");
      } finally {
        setClientsLoading(false);
      }
    };
    void loadClients();
  }, [clientScopedToProfile, profile?.client_id]);

  useEffect(() => {
    if (isEdit || !clientScopedToProfile || !profile?.client_id) return;
    const opt = clientOptions.find((o) => o.value === profile.client_id);
    if (!opt) return;
    const current = form.getFieldValue("client_id") as string | undefined;
    if (current === profile.client_id) return;
    form.setFieldsValue({
      client_id: profile.client_id,
      client_name: opt.label,
    });
  }, [isEdit, clientScopedToProfile, profile?.client_id, clientOptions, form]);

  const handleSubmit = async (values: CampaignFormValues) => {
    setLoading(true);
    try {
      let parsedDailyReporting: unknown;
      let parsedChannelSplit: unknown;
      try {
        parsedDailyReporting =
          values.daily_reporting && values.daily_reporting.trim()
            ? JSON.parse(values.daily_reporting)
            : undefined;
        parsedChannelSplit =
          values.channel_split && values.channel_split.trim()
            ? JSON.parse(values.channel_split)
            : undefined;
      } catch {
        message.error("Daily Reporting or Channel Split JSON is invalid");
        return;
      }

      const payload = {
        ...values,
        leads: [],
        campaign_questions: campaignQuestionsPayloadFromFormValues(
          values as unknown as Record<string, unknown>
        ),
        daily_reporting: parsedDailyReporting,
        channel_split: parsedChannelSplit,
        start_date: values.start_date
          ? dayjs.isDayjs(values.start_date)
            ? values.start_date.format("YYYY-MM-DD")
            : dayjs(values.start_date).format("YYYY-MM-DD")
          : undefined,
        end_date: values.end_date
          ? dayjs.isDayjs(values.end_date)
            ? values.end_date.format("YYYY-MM-DD")
            : dayjs(values.end_date).format("YYYY-MM-DD")
          : undefined,
      };

      const url = isEdit
        ? `/api/command/campaigns/${campaignId}`
        : "/api/command/campaigns";

      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as {
        campaign?: Record<string, unknown>;
        error?: string;
      };

      if (!res.ok) {
        message.error(data.error ?? "Failed to save campaign");
        return;
      }

      const persistedCampaignId =
        (data.campaign?.id as string | undefined) ?? campaignId ?? undefined;

      if (persistedCampaignId && uploadedFiles.length > 0) {
        const filesToUpload = uploadedFiles
          .filter((f) => f.originFileObj)
          .map((f) => f.originFileObj as File);
        if (filesToUpload.length > 0) {
          const { errors: uploadErrors } = await uploadCampaignFilesDirect(
            `/api/command/campaigns/${persistedCampaignId}/files`,
            filesToUpload
          );
          if (uploadErrors.length) {
            message.warning(`Campaign saved. Some files failed: ${uploadErrors.slice(0, 2).join("; ")}`);
          }
        }
      }

      message.success(isEdit ? "Campaign updated" : "Campaign created");
      onSuccess?.(data.campaign ?? {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.toLowerCase().includes("network")) {
        message.error("Network error while saving campaign");
      } else {
        message.error("Failed to save campaign");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={normalizedInitialValues}
      onFinish={handleSubmit}
      size="middle"
      style={{ maxWidth: 800 }}
    >
      <Divider orientation="left" style={{ fontSize: 13, color: "#6b7280" }}>
        Campaign Identity
      </Divider>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="campaign_id"
            label="Campaign ID"
            rules={[{ required: !isEdit, message: "Campaign ID is required" }]}
          >
            <Input placeholder="e.g. CMP-2026-001" disabled={isEdit} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="name"
            label="Campaign Name"
            rules={[{ required: true, message: "Name is required" }]}
          >
            <Input placeholder="Campaign display name" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="campaign_type"
            label="Campaign Type"
            rules={[{ required: true, message: "Campaign type is required" }]}
          >
            <Select
              placeholder="Select campaign type"
              options={[
                { value: "Email CS", label: "Email CS" },
                { value: "Email CS DT", label: "Email CS DT" },
                { value: "Webinar/Live Events", label: "Webinar/Live Events" },
                { value: "HQL", label: "HQL" },
                { value: "BANT", label: "BANT" },
                { value: "BANT-CCL", label: "BANT-CCL" },
                { value: "AG", label: "AG" },
              ]}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="client_id" label="Client" rules={[{ required: true, message: "Please select a client" }]}>
            <Select
              placeholder="Select client"
              loading={clientsLoading}
              showSearch
              allowClear={!clientScopedToProfile}
              disabled={clientScopedToProfile && Boolean(profile?.client_id)}
              options={clientOptions}
              optionFilterProp="label"
              onChange={(value) => {
                const selected = clientOptions.find((o) => o.value === value);
                form.setFieldValue("client_name", selected?.label ?? null);
              }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="status" label="Status" initialValue="active">
            <Select>
              <Select.Option value="draft">Draft</Select.Option>
              <Select.Option value="active">Active</Select.Option>
              <Select.Option value="paused">Paused</Select.Option>
              <Select.Option value="completed">Completed</Select.Option>
              <Select.Option value="cancelled">Cancelled</Select.Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="description" label="Description">
        <Input.TextArea rows={2} placeholder="Campaign objective / brief" />
      </Form.Item>

      <Divider orientation="left" style={{ fontSize: 13, color: "#6b7280" }}>
        Targeting
      </Divider>

      <Row gutter={16}>
        <Col xs={24} md={12}>
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
      </Row>

      <Divider orientation="left" style={{ fontSize: 13, color: "#6b7280" }}>
        Timeline &amp; Budget
      </Divider>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="start_date" label="Start Date">
            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="end_date" label="End Date">
            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
          </Form.Item>
        </Col>
        {!isClientViewer && (
          <Col xs={24} md={8}>
            <Form.Item name="cpl" label="CPL ($)">
              <InputNumber
                style={{ width: "100%" }}
                min={0}
                placeholder="Cost per lead"
                formatter={(v) => `$ ${v ?? ""}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              />
            </Form.Item>
          </Col>
        )}
        <Col xs={24} md={8}>
          <Form.Item name="total_allocation" label="Total Allocation">
            <InputNumber style={{ width: "100%" }} min={0} placeholder="Lead quota" />
          </Form.Item>
        </Col>
        {!isClientViewer && (
          <Col xs={24} md={8}>
            <Form.Item
              name="revenue"
              label="Revenue ($)"
              extra={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Auto-calculated: CPL × Total Allocation
                </Typography.Text>
              }
            >
              <InputNumber
                style={{ width: "100%" }}
                min={0}
                readOnly
                controls={false}
                formatter={(v) =>
                  v != null && Number.isFinite(Number(v))
                    ? `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                    : ""
                }
              />
            </Form.Item>
          </Col>
        )}
      </Row>

      <Divider orientation="left" style={{ fontSize: 13, color: "#6b7280" }}>
        Metrics Targets
      </Divider>

      <Row gutter={16}>
        <Col xs={24}>
          <Form.Item
            name="imported_leads_file"
            label="Upload File"
            extra={
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                Attach any file format.
              </Typography.Paragraph>
            }
          >
            <Space wrap align="center" size="middle">
              <Upload
                multiple
                beforeUpload={() => false}
                fileList={uploadedFiles}
                onChange={({ fileList }) => setUploadedFiles(fileList)}
              >
                <Button icon={<UploadOutlined />}>Upload file</Button>
              </Upload>
            </Space>
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="sponsor_name" label="Sponsor Name">
            <Input placeholder="Sponsor / partner name" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="lead_aggregated" label="Campaign's Client Name (Aggregator)">
            <Input placeholder="Lead aggregated source / label" />
          </Form.Item>
        </Col>
        {!isClientViewer && (
          <Col xs={24} md={12}>
            <Form.Item
              name="total_leads_delivered"
              label="Total Leads Delivered"
              extra={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Filled automatically from the leads file; cannot be edited manually.
                </Typography.Text>
              }
            >
              <InputNumber
                style={{ width: "100%" }}
                min={0}
                readOnly
                controls={false}
                placeholder="Upload a leads file to set the count"
              />
            </Form.Item>
          </Col>
        )}
      </Row>

      <Divider orientation="left" style={{ fontSize: 13, color: "#6b7280" }}>
        {DEMAND_QUALIFICATION_INSIGHTS_LABEL}
      </Divider>
      <CampaignQuestionsEditor />

      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", paddingTop: 8 }}>
        {onCancel && (
          <Button onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="primary" htmlType="submit" loading={loading}>
          {isEdit ? "Save Changes" : "Create Campaign"}
        </Button>
      </div>
    </Form>
  );
}
