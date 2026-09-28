"use client";

import { useEffect, useRef, useState } from "react";
import {
  BoldOutlined,
  ClearOutlined,
  CloseOutlined,
  DownOutlined,
  ExpandOutlined,
  ItalicOutlined,
  LinkOutlined,
  PaperClipOutlined,
  PictureOutlined,
  RobotOutlined,
  UnderlineOutlined,
} from "@ant-design/icons";
import { Button, Checkbox, Collapse, Form, Input, Modal, Select, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";

const BORDER = "#eaf0f6";
const MUTED = "#516f90";

function addBusinessDays(start: dayjs.Dayjs, n: number) {
  let d = start;
  let count = 0;
  while (count < n) {
    d = d.add(1, "day");
    const dow = d.day();
    if (dow !== 0 && dow !== 6) count++;
  }
  return d.hour(9).minute(0).second(0).millisecond(0);
}

function nextMondayFrom(start: dayjs.Dayjs) {
  let d = start.startOf("day");
  do {
    d = d.add(1, "day");
  } while (d.day() !== 1);
  return d.hour(9).minute(0).second(0).millisecond(0);
}

export type FollowUpPreset = "b1" | "b3" | "b5" | "next_monday";

function dueDateForPreset(preset: FollowUpPreset): string {
  const now = dayjs();
  let d: dayjs.Dayjs;
  switch (preset) {
    case "b1":
      d = addBusinessDays(now, 1);
      break;
    case "b3":
      d = addBusinessDays(now, 3);
      break;
    case "b5":
      d = addBusinessDays(now, 5);
      break;
    case "next_monday":
      d = nextMondayFrom(now);
      break;
    default:
      d = addBusinessDays(now, 3);
  }
  return d.toISOString();
}

function followUpOptions() {
  const now = dayjs();
  return [
    { value: "b1" as const, label: `In 1 business day (${addBusinessDays(now, 1).format("dddd")})` },
    { value: "b3" as const, label: `In 3 business days (${addBusinessDays(now, 3).format("dddd")})` },
    { value: "b5" as const, label: `In 5 business days (${addBusinessDays(now, 5).format("dddd")})` },
    { value: "next_monday" as const, label: `Next Monday (${nextMondayFrom(now).format("MMM D")})` },
  ];
}

type Props = {
  open: boolean;
  onClose: () => void;
  leadDisplayName: string;
  extraRecordCount?: number;
  submitting?: boolean;
  onSubmit: (payload: {
    body: string;
    createFollowUpTask: boolean;
    followUpPreset: FollowUpPreset;
  }) => Promise<void>;
};

const { Text } = Typography;

export function LeadNoteModal({
  open,
  onClose,
  leadDisplayName,
  extraRecordCount = 0,
  submitting,
  onSubmit,
}: Props) {
  const [form] = Form.useForm<{ body: string; createTask: boolean; followPreset: FollowUpPreset }>();
  const [expanded, setExpanded] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyVal = Form.useWatch("body", form) ?? "";
  const createTask = Form.useWatch("createTask", form) ?? false;
  const followOpts = followUpOptions();

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setExpanded(false);
    } else {
      form.setFieldsValue({
        body: "",
        createTask: false,
        followPreset: "b3",
      });
    }
  }, [open, form]);

  const insertWrap = (before: string, after: string) => {
    const el = taRef.current;
    const cur = form.getFieldValue("body") ?? "";
    if (el) {
      const s = el.selectionStart;
      const e = el.selectionEnd;
      const sel = cur.slice(s, e);
      const next = cur.slice(0, s) + before + sel + after + cur.slice(e);
      form.setFieldValue("body", next);
      requestAnimationFrame(() => {
        el.focus();
        const pos = s + before.length + sel.length + after.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      form.setFieldValue("body", `${cur}${before}${after}`);
    }
  };

  const recordLabel =
    extraRecordCount > 0
      ? `${leadDisplayName || "Lead"} and ${extraRecordCount} record${extraRecordCount === 1 ? "" : "s"}`
      : leadDisplayName || "Lead";

  const handleOk = async () => {
    const v = await form.validateFields();
    await onSubmit({
      body: v.body.trim(),
      createFollowUpTask: v.createTask,
      followUpPreset: v.followPreset,
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnClose
      closable={false}
      styles={{
        content: { padding: 0, borderRadius: 8, overflow: "hidden" },
        body: { padding: 0 },
      }}
    >
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Space size={10}>
          <DownOutlined style={{ color: MUTED, fontSize: 12 }} />
          <Text strong style={{ fontSize: 16 }}>
            Note
          </Text>
        </Space>
        <Space size={4}>
          <Button type="text" icon={<ExpandOutlined />} onClick={() => setExpanded((x) => !x)} aria-label="Expand" />
          <Button type="text" icon={<CloseOutlined />} onClick={onClose} aria-label="Close" />
        </Space>
      </div>

      <div style={{ padding: "16px 18px 20px" }}>
        <Form form={form} layout="vertical" initialValues={{ createTask: false, followPreset: "b3" }}>
          <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              For
            </Text>
            <Tag
              style={{
                margin: 0,
                borderRadius: 999,
                padding: "4px 12px",
                border: `1px solid ${BORDER}`,
                background: "#f5f8fa",
                color: "#33475b",
                fontSize: 13,
              }}
            >
              {recordLabel}
            </Tag>
          </div>

          <div
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              background: "#fff",
              position: "relative",
              minHeight: expanded ? 420 : 220,
            }}
          >
            <Form.Item
              name="body"
              rules={[{ required: true, message: "Enter a note" }]}
              style={{ marginBottom: 0 }}
            >
              <Input.TextArea
                ref={taRef}
                variant="borderless"
                placeholder="Start typing to leave a note..."
                autoSize={{ minRows: expanded ? 16 : 8 }}
                style={{
                  padding: "14px 16px 48px",
                  fontSize: 15,
                  lineHeight: 1.5,
                  resize: "none",
                }}
              />
            </Form.Item>
            <div
              style={{
                position: "absolute",
                right: 12,
                bottom: 44,
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "#00a38d",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 14,
                pointerEvents: "none",
              }}
            >
              <RobotOutlined />
            </div>
            <div
              style={{
                borderTop: `1px solid ${BORDER}`,
                padding: "6px 8px",
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 2,
                background: "#fafbfc",
              }}
            >
              <Button type="text" size="small" icon={<BoldOutlined />} onClick={() => insertWrap("**", "**")} />
              <Button type="text" size="small" icon={<ItalicOutlined />} onClick={() => insertWrap("*", "*")} />
              <Button type="text" size="small" icon={<UnderlineOutlined />} onClick={() => insertWrap("<u>", "</u>")} />
              <Button type="text" size="small" icon={<ClearOutlined />} onClick={() => form.setFieldValue("body", "")} />
              <Button type="text" size="small" style={{ color: MUTED }}>
                More <DownOutlined style={{ fontSize: 10 }} />
              </Button>
              <div style={{ flex: 1 }} />
              <Button type="text" size="small" icon={<LinkOutlined />} disabled />
              <Button type="text" size="small" icon={<PictureOutlined />} disabled />
              <Button type="text" size="small" disabled>
                🎓
              </Button>
              <Button type="text" size="small" icon={<PaperClipOutlined />} disabled />
            </div>
          </div>

          <Collapse
            ghost
            style={{ marginTop: 16 }}
            items={[
              {
                key: "assoc",
                label: <span style={{ color: MUTED, fontWeight: 600, fontSize: 13 }}>Associated with {1 + extraRecordCount} record{1 + extraRecordCount === 1 ? "" : "s"}</span>,
                children: (
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    This note is linked to this lead{extraRecordCount > 0 ? " and related records" : ""}.
                  </Text>
                ),
              },
            ]}
          />

          <div style={{ marginTop: 8, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "6px 8px",
                fontSize: 14,
              }}
            >
              <Form.Item name="createTask" valuePropName="checked" noStyle>
                <Checkbox />
              </Form.Item>
              <span>Create a</span>
              <Text strong>To-do</Text>
              <span>task to follow up</span>
              <Form.Item name="followPreset" noStyle>
                <Select
                  size="small"
                  variant="borderless"
                  style={{ minWidth: 200, fontWeight: 600 }}
                  options={followOpts}
                  disabled={!createTask}
                />
              </Form.Item>
            </div>
          </div>

          <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-start" }}>
            <Button
              type="primary"
              size="large"
              loading={submitting}
              disabled={!String(bodyVal).trim()}
              onClick={() => void handleOk()}
              style={{
                minWidth: 160,
                borderRadius: 4,
                background: String(bodyVal).trim() ? "#425b76" : undefined,
                borderColor: String(bodyVal).trim() ? "#425b76" : undefined,
              }}
            >
              Create note
            </Button>
          </div>
        </Form>
      </div>
    </Modal>
  );
}

export { dueDateForPreset };
