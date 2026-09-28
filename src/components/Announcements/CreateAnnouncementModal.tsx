"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Switch,
  Typography,
  message,
} from "antd";
import { MinusCircleOutlined, PlusOutlined, TeamOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useQuery } from "@tanstack/react-query";
import type {
  AnnouncementType,
  AudiencePreview,
  PermissionRule,
  TargetMode,
} from "@/lib/announcements/types";

const { Text } = Typography;

const TYPE_LABELS: Record<AnnouncementType, string> = {
  note: "Note",
  warning: "Warning",
  alert: "Alert",
  poll: "Poll",
};

function roleLabel(slug: string): string {
  return slug
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type FormValues = {
  target_role: string;
  type: AnnouncementType;
  mode: TargetMode;
  campaign_id?: string;
  user_ids?: string[];
  title: string;
  message?: string;
  poll_options?: { text: string }[];
  is_anonymous?: boolean;
  closes_at?: Dayjs | null;
};

type CreateAnnouncementModalProps = {
  open: boolean;
  rules: PermissionRule[];
  onClose: () => void;
  onCreated: () => void;
};

export default function CreateAnnouncementModal({
  open,
  rules,
  onClose,
  onCreated,
}: CreateAnnouncementModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);

  const targetRole = Form.useWatch("target_role", form);
  const type = Form.useWatch("type", form);
  const mode = Form.useWatch("mode", form);
  const campaignId = Form.useWatch("campaign_id", form);
  const userIds = Form.useWatch("user_ids", form);

  const activeRule = useMemo(
    () => rules.find((r) => r.target_role === targetRole) ?? null,
    [rules, targetRole]
  );

  // Selector data (campaigns for group mode; users for individual mode).
  const optionsQuery = useQuery({
    queryKey: ["announcements", "options", targetRole ?? ""],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (targetRole) params.set("target_role", targetRole);
      const res = await fetch(`/api/announcements/options?${params.toString()}`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        campaigns?: { id: string; name: string }[];
        users?: { id: string; name: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load options");
      return { campaigns: data.campaigns ?? [], users: data.users ?? [] };
    },
    enabled: open && Boolean(targetRole),
    staleTime: 60_000,
  });

  // Debounced "will reach N people" preview.
  const [previewKey, setPreviewKey] = useState("");
  useEffect(() => {
    const params = new URLSearchParams();
    if (!targetRole || !mode || !type) {
      setPreviewKey("");
      return;
    }
    if (mode === "group" && !campaignId) {
      setPreviewKey("");
      return;
    }
    if (mode === "user" && (!userIds || userIds.length === 0)) {
      setPreviewKey("");
      return;
    }
    params.set("mode", mode);
    params.set("target_role", targetRole);
    params.set("type", type);
    if (campaignId) params.set("campaign_id", campaignId);
    if (userIds?.length) params.set("user_ids", userIds.join(","));
    const key = params.toString();
    const t = setTimeout(() => setPreviewKey(key), 400);
    return () => clearTimeout(t);
  }, [targetRole, mode, type, campaignId, userIds]);

  const previewQuery = useQuery({
    queryKey: ["announcements", "audience-preview", previewKey],
    queryFn: async (): Promise<AudiencePreview> => {
      const res = await fetch(`/api/announcements/audience-preview?${previewKey}`, {
        credentials: "include",
      });
      const data = (await res.json()) as AudiencePreview & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      return data;
    },
    enabled: open && previewKey.length > 0,
    staleTime: 30_000,
  });

  const allowedTypes = activeRule?.allowed_types ?? [];

  // Pre-select the first target role on open so the allowed types render
  // immediately (types depend on the sender→target matrix rule).
  useEffect(() => {
    if (!open || rules.length === 0) return;
    if (!form.getFieldValue("target_role")) {
      form.setFieldValue("target_role", rules[0].target_role);
    }
  }, [open, rules, form]);

  // Keep the selected type valid when the target role changes.
  useEffect(() => {
    if (!activeRule) return;
    if (type && !activeRule.allowed_types.includes(type)) {
      form.setFieldValue("type", activeRule.allowed_types[0]);
    }
  }, [activeRule, type, form]);

  const handleSubmit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        type: values.type,
        title: values.title.trim(),
        message: values.message?.trim() ?? "",
        targeting: {
          mode: values.mode,
          target_role: values.target_role,
          campaign_id: values.mode === "group" ? values.campaign_id : undefined,
          user_ids: values.mode === "user" ? values.user_ids : undefined,
        },
        poll:
          values.type === "poll"
            ? {
                options: (values.poll_options ?? []).map((o) => o.text),
                is_anonymous: Boolean(values.is_anonymous),
                closes_at: values.closes_at ? values.closes_at.toISOString() : null,
              }
            : undefined,
      };

      const res = await fetch("/api/announcements", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        recipient_count?: number;
      };
      if (!res.ok) {
        message.error(json.error ?? "Failed to send announcement");
        return;
      }
      message.success(`Announcement sent to ${json.recipient_count ?? 0} people`);
      form.resetFields();
      onCreated();
      onClose();
    } catch {
      message.error("Failed to send announcement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="New Announcement"
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      onOk={() => void handleSubmit()}
      okText="Send"
      confirmLoading={submitting}
      width={560}
      destroyOnClose
    >
      <Form<FormValues>
        form={form}
        layout="vertical"
        initialValues={{ mode: "group", type: "note" }}
        style={{ marginTop: 8 }}
      >
        <Form.Item
          name="target_role"
          label="Send to"
          rules={[{ required: true, message: "Select a target role" }]}
        >
          <Select
            placeholder="Select role"
            options={rules.map((r) => ({
              value: r.target_role,
              label: roleLabel(r.target_role),
            }))}
          />
        </Form.Item>

        <Form.Item
          name="type"
          label="Type"
          rules={[{ required: true }]}
          extra={
            !activeRule
              ? "Select who to send to first — allowed types depend on the target role"
              : undefined
          }
        >
          <Radio.Group disabled={!activeRule}>
            {(allowedTypes.length > 0
              ? allowedTypes
              : (["note"] as AnnouncementType[])
            ).map((t) => (
              <Radio.Button key={t} value={t}>
                {TYPE_LABELS[t]}
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>

        <Form.Item name="mode" label="Audience" rules={[{ required: true }]}>
          <Radio.Group>
            <Radio.Button value="group">Campaign group</Radio.Button>
            <Radio.Button value="role">Entire role</Radio.Button>
            <Radio.Button value="user">Specific people</Radio.Button>
          </Radio.Group>
        </Form.Item>

        {mode === "group" ? (
          <Form.Item
            name="campaign_id"
            label="Campaign"
            rules={[{ required: true, message: "Select a campaign" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select campaign"
              loading={optionsQuery.isLoading}
              options={(optionsQuery.data?.campaigns ?? []).map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />
          </Form.Item>
        ) : null}

        {mode === "user" ? (
          <Form.Item
            name="user_ids"
            label="People"
            rules={[{ required: true, message: "Select at least one person" }]}
          >
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              placeholder="Select people"
              loading={optionsQuery.isLoading}
              options={(optionsQuery.data?.users ?? []).map((u) => ({
                value: u.id,
                label: u.name,
              }))}
            />
          </Form.Item>
        ) : null}

        {previewKey && previewQuery.data ? (
          <Alert
            type={previewQuery.data.count > 0 ? "info" : "warning"}
            showIcon
            icon={<TeamOutlined />}
            style={{ marginBottom: 16 }}
            message={
              previewQuery.data.count > 0
                ? `Will reach ${previewQuery.data.count} ${
                    previewQuery.data.count === 1 ? "person" : "people"
                  }`
                : "No recipients match this selection"
            }
            description={
              previewQuery.data.sample.length > 0 ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {previewQuery.data.sample.map((s) => s.name).join(", ")}
                  {previewQuery.data.count > previewQuery.data.sample.length ? "…" : ""}
                </Text>
              ) : undefined
            }
          />
        ) : null}

        <Form.Item
          name="title"
          label="Title"
          rules={[{ required: true, whitespace: true, message: "Title is required" }]}
        >
          <Input maxLength={200} placeholder="Announcement title" />
        </Form.Item>

        <Form.Item name="message" label="Message">
          <Input.TextArea rows={3} maxLength={2000} placeholder="Details (optional)" />
        </Form.Item>

        {type === "poll" ? (
          <>
            <Form.List
              name="poll_options"
              initialValue={[{ text: "" }, { text: "" }]}
              rules={[
                {
                  validator: async (_, options: { text: string }[] | undefined) => {
                    const filled = (options ?? []).filter((o) => o?.text?.trim());
                    if (filled.length < 2) {
                      return Promise.reject(new Error("Add at least 2 options"));
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              {(fields, { add, remove }, { errors }) => (
                <Form.Item label="Poll options" required>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {fields.map((field) => (
                      <div key={field.key} style={{ display: "flex", gap: 8 }}>
                        <Form.Item
                          name={[field.name, "text"]}
                          noStyle
                          rules={[{ required: true, whitespace: true, message: "Option text" }]}
                        >
                          <Input placeholder={`Option ${field.name + 1}`} maxLength={200} />
                        </Form.Item>
                        {fields.length > 2 ? (
                          <Button
                            type="text"
                            icon={<MinusCircleOutlined />}
                            onClick={() => remove(field.name)}
                          />
                        ) : null}
                      </div>
                    ))}
                    {fields.length < 10 ? (
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={() => add({ text: "" })}
                      >
                        Add option
                      </Button>
                    ) : null}
                    <Form.ErrorList errors={errors} />
                  </div>
                </Form.Item>
              )}
            </Form.List>

            <Form.Item
              name="is_anonymous"
              label="Anonymous voting"
              valuePropName="checked"
              tooltip="When on, you'll see vote counts but not who voted"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              name="closes_at"
              label="Auto-close at"
              tooltip="Voting locks after this time. Leave empty to keep the poll open."
            >
              <DatePicker
                showTime
                style={{ width: "100%" }}
                disabledDate={(d) => d.isBefore(dayjs(), "day")}
              />
            </Form.Item>
          </>
        ) : null}
      </Form>
    </Modal>
  );
}
