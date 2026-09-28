"use client";

import React, { useState, useEffect, useRef } from "react";
import { Form, Input, Select, DatePicker, Row, Col, Collapse, Typography, Button, Spin, message } from "antd";
import {
  PlusOutlined,
  PlayCircleOutlined,
  DeleteOutlined,
  UploadOutlined,
  FileOutlined,
  FilePdfOutlined,
  LinkOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { FormInstance } from "antd/es/form";
import type { Dayjs } from "dayjs";
import { generateLhoPdf } from "@/lib/generateLhoPdf";
import { buildLhoDataFromLead } from "@/lib/lho/build-lho-data";
import { shouldGenerateLhoPdfWithLogo } from "@/lib/lho/logo-pdf";
import { wallClockDayjsToUtcIso, translateWallClockDayjs } from "@/lib/timezones";
import { getDefaultLeadTimezone } from "@/lib/lead-timezone-catalog";
import { LeadTimezoneSelect } from "@/components/Leads/LeadTimezoneSelect";
import {
  STATUS_OPTIONS,
  QA_STATUS_OPTIONS,
  LEAD_TAGGING_OPTIONS,
  SALUTATION_OPTIONS,
  JOB_FUNCTION_OPTIONS,
  JOB_LEVEL_OPTIONS,
  EMPLOYEE_SIZE_OPTIONS,
  QA_AUDIT_DISQUALIFICATION_OPTIONS,
} from "@/types/lead.types";
import type { Lead } from "@/types/lead.types";
import { useAuth } from "@/context/AuthContext";
import { nextExtraCqIndex, parseExtraCqIndexes } from "@/lib/extra-cq";
import {
  DEMAND_QUALIFICATION_INSIGHTS_LABEL,
  type CampaignQuestion,
} from "@/lib/campaign-questions";
import { LEAD_MEETING_NOTES_LABEL } from "@/lib/lead-field-labels";
import {
  CLOUDTHAT_AG_LEAD_TAGGING_OPTIONS,
  isCloudThatAgCampaign,
  shouldShowDemandForCloudThatAgTagging,
} from "@/lib/cloudthat-ag";
import { CampaignCqAnswerFields } from "@/components/Leads/CampaignCqAnswerFields";
import { AgentCallLogCards, type AgentCallLogCardsHandle } from "@/components/Leads/AgentCallLogCards";
import {
  digitsOnlyFormRules,
  normalizeDigitsOnly,
  normalizePhoneNumeric,
  phoneNumericFormRules,
} from "@/lib/lead-field-validation";
import {
  LEAD_MEETING_DATE_TIME_LABEL,
  LEAD_MEETING_SET_DATE_TIME_LABEL,
} from "@/lib/lead-field-labels";

function toExternalUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function buildAddressSearchQuery(parts: {
  address?: unknown;
  city?: unknown;
  state?: unknown;
  country?: unknown;
  zip_code?: unknown;
}): string | null {
  const segments = [
    parts.address,
    parts.city,
    parts.state,
    parts.zip_code,
    parts.country,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  return segments.length > 0 ? segments.join(", ") : null;
}

function toGoogleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function LeadAddressLineField({ form, required = false }: { form: FormInstance; required?: boolean }) {
  const address = Form.useWatch("address", form);
  const city = Form.useWatch("city", form);
  const state = Form.useWatch("state", form);
  const country = Form.useWatch("country", form);
  const zipCode = Form.useWatch("zip_code", form);

  const addressTrim = String(address ?? "").trim();
  const searchQuery =
    addressTrim.length > 0
      ? buildAddressSearchQuery({
          address,
          city,
          state,
          country,
          zip_code: zipCode,
        })
      : null;
  const googleHref = searchQuery ? toGoogleSearchUrl(searchQuery) : null;

  return (
    <Form.Item
      label="Address Line 1"
      name="address"
      rules={required ? [{ required: true, message: "Please enter Address Line 1" }] : undefined}
      extra={
        googleHref ? (
          <Typography.Link href={googleHref} target="_blank" rel="noopener noreferrer">
            <SearchOutlined /> Search on Google
          </Typography.Link>
        ) : undefined
      }
    >
      <Input placeholder="Street address" />
    </Form.Item>
  );
}

function LeadUrlFormField({
  form,
  name,
  label,
  placeholder,
  showOpenLink,
  required = false,
}: {
  form: FormInstance;
  name: string;
  label: string;
  placeholder?: string;
  showOpenLink: boolean;
  required?: boolean;
}) {
  const value = Form.useWatch(name, form);
  const href = showOpenLink ? toExternalUrl(value) : null;

  return (
    <Form.Item
      label={label}
      name={name}
      rules={required ? [{ required: true, message: `Please enter ${label}` }] : undefined}
      extra={
        href ? (
          <Typography.Link href={href} target="_blank" rel="noopener noreferrer">
            <LinkOutlined /> Open in new tab
          </Typography.Link>
        ) : undefined
      }
    >
      <Input placeholder={placeholder ?? "URL"} />
    </Form.Item>
  );
}

type LeadFormProps = {
  form: ReturnType<typeof Form.useForm>[0];
  mode: "create" | "edit";
  lead?: Lead | null;
  canEditQaAudit?: boolean;
  /** When set, show campaign-defined question labels (agents answer only). */
  campaignQuestions?: CampaignQuestion[] | null;
  /** Campaign display name — used for CloudThat AG-only form rules. */
  campaignName?: string | null;
  /** Agent per-lead type (options from campaign.lead_type). */
  showLeadTypeField?: boolean;
  leadTypeOptions?: { value: string; label: string }[];
  /** Hide the contact phone input where a campaign does not collect it. */
  hidePhoneNumber?: boolean;
};

export function LeadForm({
  form,
  mode,
  lead,
  canEditQaAudit = false,
  campaignQuestions = null,
  campaignName = null,
  showLeadTypeField = false,
  leadTypeOptions = [],
  hidePhoneNumber = false,
}: LeadFormProps) {
  const showOpenLink = mode === "edit";
  const useCampaignCq =
    Array.isArray(campaignQuestions) && campaignQuestions.length > 0;
  const isCloudThatAg = isCloudThatAgCampaign(campaignName);
  const leadTaggingOptions = isCloudThatAg
    ? CLOUDTHAT_AG_LEAD_TAGGING_OPTIONS
    : LEAD_TAGGING_OPTIONS;
  const watchedLeadTagging = Form.useWatch("lead_tagging", form) as
    | string
    | null
    | undefined;
  const showDemandSection =
    useCampaignCq &&
    (!isCloudThatAg || shouldShowDemandForCloudThatAgTagging(watchedLeadTagging));
  const { profile, hasRole, user } = useAuth();
  const isAgentEntry = hasRole("agent");
  const isAgentCampaignCreate = isAgentEntry && mode === "create";
  const loggedInQaName =
    profile?.full_name?.trim() || profile?.email?.trim() || user?.email?.trim() || "";
  const [showMoreCq, setShowMoreCq] = useState(false);
  const [dynamicCqIndexes, setDynamicCqIndexes] = useState<number[]>([]);
  const [voiceRecordings, setVoiceRecordings] = useState<
    { id: string; name: string; path: string; url: string | null }[]
  >([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const agentCallLogsRef = useRef<AgentCallLogCardsHandle | null>(null);
  const previousAppointmentTzRef = useRef<string>(getDefaultLeadTimezone());
  const previousScoredTzRef = useRef<string>(getDefaultLeadTimezone());
  const [lhoFiles, setLhoFiles] = useState<
    { id: string; name: string; path: string; url: string | null; size: number | null }[]
  >([]);
  const [lhoLoading, setLhoLoading] = useState(false);
  const [lhoUploading, setLhoUploading] = useState(false);
  const lhoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!lead) {
      setShowMoreCq(false);
      setDynamicCqIndexes([]);
      previousAppointmentTzRef.current = getDefaultLeadTimezone();
      previousScoredTzRef.current = getDefaultLeadTimezone();
      return;
    }
    const extraIndexes = parseExtraCqIndexes(lead.extra_cq);
    if (lead.cq3 || lead.cq4 || lead.cq5 || extraIndexes.length > 0) {
      setShowMoreCq(true);
    }
    setDynamicCqIndexes(extraIndexes);
    const leadRecord = lead as unknown as Record<string, unknown>;
    previousAppointmentTzRef.current =
      (leadRecord.appointment_timezone as string) || getDefaultLeadTimezone();
    previousScoredTzRef.current =
      (leadRecord.scored_timezone as string) || getDefaultLeadTimezone();
  }, [lead]);

  const addDynamicCqField = () => {
    setDynamicCqIndexes((prev) => {
      const next = nextExtraCqIndex(prev);
      return [...prev, next];
    });
  };

  const removeDynamicCqField = (index: number) => {
    setDynamicCqIndexes((prev) => prev.filter((n) => n !== index));
    const extra = (form.getFieldValue("extra_cq") as Record<string, string> | undefined) ?? {};
    const { [`cq${index}`]: _removed, ...rest } = extra;
    form.setFieldValue("extra_cq", Object.keys(rest).length > 0 ? rest : undefined);
  };

  // Show logged-in QA name when lead has no qa_name yet (saved on submit by API).
  useEffect(() => {
    if (!hasRole("qa") || !loggedInQaName) return;
    const existing = (form.getFieldValue("qa_name") as string | undefined)?.trim()
      || lead?.qa_name?.trim();
    if (!existing) {
      form.setFieldValue("qa_name", loggedInQaName);
    }
  }, [form, hasRole, lead?.qa_name, loggedInQaName]);

  useEffect(() => {
    const loadVoiceRecordings = async () => {
      // Agents see call log cards from the Call Logs DB instead of audio recordings.
      if (!lead?.id || mode !== "edit" || isAgentEntry) {
        setVoiceRecordings([]);
        return;
      }
      setVoiceLoading(true);
      try {
        const res = await fetch(`/api/agent/leads/${lead.id}/voice-lock`, {
          credentials: "include",
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          if (json?.error) {
            message.warning(`Voice Log: ${json.error}`);
          }
          return;
        }
        const json = await res.json();
        setVoiceRecordings(
          (json?.recordings ?? []).map((r: any) => ({
            id: r.id ?? r.path,
            name: r.name,
            path: r.path,
            url: r.url ?? null,
          })),
        );
      } catch (err) {
        console.error("Failed to load voice recordings", err);
      } finally {
        setVoiceLoading(false);
      }
    };

    loadVoiceRecordings();
  }, [lead?.id, mode, isAgentEntry]);

  useEffect(() => {
    const loadLhoFiles = async () => {
      if (!lead?.id) {
        setLhoFiles([]);
        return;
      }
      setLhoLoading(true);
      try {
        const res = await fetch(`/api/agent/leads/${lead.id}/lho`, {
          credentials: "include",
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          // Agents: stay quiet (leads stored in the Call Logs DB have no LHO in main DB).
          if (json?.error && !isAgentEntry) {
            message.warning(`LHO: ${json.error}`);
          }
          setLhoFiles([]);
          return;
        }
        const json = await res.json();
        setLhoFiles(
          (json?.files ?? []).map((f: any) => ({
            id: f.id ?? f.path,
            name: f.name,
            path: f.path,
            url: f.url ?? null,
            size: typeof f.size === "number" ? f.size : null,
          })),
        );
      } catch (err) {
        console.error("Failed to load LHO files", err);
      } finally {
        setLhoLoading(false);
      }
    };

    loadLhoFiles();
  }, [lead?.id, isAgentEntry]);

  const handleUploadVoice = async (file: File | null) => {
    if (!lead?.id || mode !== "edit" || !file) {
      message.error("Voice Log upload is only available while editing an existing lead.");
      return;
    }
    setVoiceUploading(true);
    try {
      // Step 1 — get a signed upload URL from server (tiny JSON request, no Vercel size limit issue)
      const presignRes = await fetch(`/api/agent/leads/${lead.id}/voice-lock/presign`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type || "audio/mpeg" }),
      });
      const presignJson = await presignRes.json().catch(() => ({}));
      if (!presignRes.ok) {
        message.error(presignJson?.error || "Failed to prepare upload");
        return;
      }

      const { signedUrl, path } = presignJson as { signedUrl: string; token: string; path: string };

      // Step 2 — upload directly to Supabase Storage (bypasses Vercel's 4.5 MB body limit)
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "audio/mpeg" },
        body: file,
      });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => "");
        message.error(`Upload failed (${uploadRes.status})${errText ? `: ${errText}` : ""}`);
        return;
      }

      // Step 3 — catalog path in lead_assets (avoids Storage.list N+1)
      if (path) {
        const registerRes = await fetch(`/api/agent/leads/${lead.id}/voice-lock/register`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path,
            fileName: file.name,
            mimeType: file.type || "audio/mpeg",
            fileSize: file.size,
          }),
        });
        if (!registerRes.ok) {
          const regJson = await registerRes.json().catch(() => ({}));
          message.warning(
            (regJson as { error?: string })?.error ||
              "Uploaded but catalog sync failed. Refresh if recording is missing."
          );
        }
      }

      // Step 4 — refresh recordings list from server (signed URLs for playback)
      const listRes = await fetch(`/api/agent/leads/${lead.id}/voice-lock`, {
        credentials: "include",
      });
      const listJson = await listRes.json().catch(() => ({}));
      if (listRes.ok) {
        setVoiceRecordings(
          (listJson?.recordings ?? []).map((r: { id?: string; path: string; name: string; url?: string | null }) => ({
            id: r.id ?? r.path,
            name: r.name,
            path: r.path,
            url: r.url ?? null,
          })),
        );
      }

      if (!path) {
        message.warning("Uploaded but could not confirm. Refresh to check.");
      } else {
        message.success("Recording uploaded");
      }
    } catch (err) {
      console.error("Voice upload error", err);
      message.error("Failed to upload recording");
    } finally {
      setVoiceUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteVoice = async (path: string) => {
    if (!lead?.id || mode !== "edit" || !path) return;
    try {
      const res = await fetch(`/api/agent/leads/${lead.id}/voice-lock`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(json?.error || "Failed to delete recording");
        return;
      }
      setVoiceRecordings(
        (json?.recordings ?? []).map((r: any) => ({
          id: r.id ?? r.path,
          name: r.name,
          path: r.path,
          url: r.url ?? null,
        })),
      );
      message.success("Recording deleted");
    } catch (err) {
      console.error("Voice delete error", err);
      message.error("Failed to delete recording");
    }
  };

  const handleUploadLho = async (file: File | null) => {
    if (!lead?.id || !file) {
      message.error("LHO upload is only available for an existing lead.");
      return;
    }
    setLhoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/agent/leads/${lead.id}/lho`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(json?.error || "Failed to upload LHO file");
        return;
      }
      setLhoFiles(
        (json?.files ?? []).map((f: any) => ({
          id: f.id ?? f.path,
          name: f.name,
          path: f.path,
          url: f.url ?? null,
          size: typeof f.size === "number" ? f.size : null,
        })),
      );
      message.success("LHO file uploaded");
    } catch (err) {
      console.error("LHO upload error", err);
      message.error("Failed to upload LHO file");
    } finally {
      setLhoUploading(false);
      if (lhoInputRef.current) {
        lhoInputRef.current.value = "";
      }
    }
  };

  const handleDeleteLho = async (path: string) => {
    if (!lead?.id || !path) return;
    try {
      const res = await fetch(`/api/agent/leads/${lead.id}/lho`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(json?.error || "Failed to delete LHO file");
        return;
      }
      setLhoFiles(
        (json?.files ?? []).map((f: any) => ({
          id: f.id ?? f.path,
          name: f.name,
          path: f.path,
          url: f.url ?? null,
          size: typeof f.size === "number" ? f.size : null,
        })),
      );
      message.success("LHO file deleted");
    } catch (err) {
      console.error("LHO delete error", err);
      message.error("Failed to delete LHO file");
    }
  };

  const firstName = Form.useWatch("first_name", form);
  const lastName = Form.useWatch("last_name", form);
  const email = Form.useWatch("email", form);
  const companyName = Form.useWatch("company_name", form);
  const domain = Form.useWatch("domain", form);

  const hasIdentityFields =
    typeof firstName === "string" &&
    firstName.trim().length > 0 &&
    typeof lastName === "string" &&
    lastName.trim().length > 0 &&
    typeof email === "string" &&
    email.trim().length > 0 &&
    typeof companyName === "string" &&
    companyName.trim().length > 0 &&
    typeof domain === "string" &&
    domain.trim().length > 0;

  const hasLeadId = !!lead?.id;
  const canUseVoiceLock = hasLeadId && hasIdentityFields;
  const showAgentCallLogs = isAgentEntry && canUseVoiceLock;

  const renderSection = (
    key: string,
    title: string,
    icon: string,
    children: React.ReactNode,
    titleAddon?: React.ReactNode
  ) => (
    <Collapse.Panel
      key={key}
      header={
        <span style={{ fontWeight: 600, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>
          {icon} {title}
          {titleAddon}
        </span>
      }
    >
      {children}
    </Collapse.Panel>
  );

  return (
    <Form form={form} layout="vertical" className="lead-form">
      {isAgentEntry && mode === "create" ? (
        <div className="agent-lead-tour-required-hint" data-tour="agent-lead-required-fields">
          <span className="agent-lead-tour-required-hint__badge" aria-hidden>
            *
          </span>
          <span>
            Required fields are marked with a red asterisk. Fill them before saving the lead.
          </span>
        </div>
      ) : null}
      {/* Contact Person Details | Company Information — side by side */}
      <Row gutter={24} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Collapse defaultActiveKey={["contact"]} expandIconPosition="end">
            {renderSection(
              "contact",
              "Contact Person Details",
              "👤",
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="Salutation"
                    name="salutation"
                    rules={
                      isAgentEntry
                        ? [{ required: true, message: "Please select Salutation" }]
                        : undefined
                    }
                  >
                    <Select
                      placeholder="Select"
                      options={SALUTATION_OPTIONS}
                      allowClear={!isAgentEntry}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="First Name" name="first_name" rules={[{ required: true, message: "Please enter First Name" }]}>
                    <Input placeholder="First name" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Last Name" name="last_name" rules={[{ required: true, message: "Please enter Last Name" }]}>
                    <Input placeholder="Last name" />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item label="Email Address" name="email" rules={[{ required: true, message: "Please enter Email Address" }, { type: "email" as const, message: "Please enter a valid email" }]}>
                    <Input placeholder="email@example.com" type="email" />
                  </Form.Item>
                </Col>
                {!hidePhoneNumber && (
                  <Col xs={24} sm={12}>
                    <Form.Item
                      label="Phone Number"
                      name="phone"
                      rules={isAgentEntry ? phoneNumericFormRules("Phone Number") : undefined}
                      normalize={isAgentEntry ? normalizePhoneNumeric : undefined}
                    >
                      <Input placeholder="+1 555 123 4567" />
                    </Form.Item>
                  </Col>
                )}
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="Direct Number"
                    name="direct_number"
                    rules={isAgentCampaignCreate ? [{ required: true, message: "Please enter Direct Number" }, ...phoneNumericFormRules("Direct Number")] : isAgentEntry ? phoneNumericFormRules("Direct Number") : undefined}
                    normalize={isAgentEntry ? normalizePhoneNumeric : undefined}
                  >
                    <Input placeholder="+1 555 987 6543" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Job Title" name="job_title" rules={isAgentCampaignCreate ? [{ required: true, message: "Please enter Job Title" }] : undefined}>
                    <Input placeholder="Job title" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Job Title Level" name="job_level" rules={isAgentCampaignCreate ? [{ required: true, message: "Please select Job Title Level" }] : undefined}>
                    <Select placeholder="Select" options={JOB_LEVEL_OPTIONS} allowClear />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Department" name="department" rules={isAgentCampaignCreate ? [{ required: true, message: "Please enter Department" }] : undefined}>
                    <Input placeholder="Department" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Job Function" name="job_function" rules={isAgentCampaignCreate ? [{ required: true, message: "Please select Job Function" }] : undefined}>
                    <Select placeholder="Select" options={JOB_FUNCTION_OPTIONS} allowClear />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <LeadUrlFormField
                    form={form}
                    name="job_title_link"
                    label="Job Title Link"
                    placeholder="URL"
                    showOpenLink={showOpenLink}
                    required={isAgentCampaignCreate}
                  />
                </Col>
                {isAgentEntry && (
                  <>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Tenurity" name="tenurity" rules={isAgentCampaignCreate ? [{ required: true, message: "Please enter Tenurity" }] : undefined}>
                        <Input placeholder="Tenurity" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="VV Status" name="vv_status" rules={isAgentCampaignCreate ? [{ required: true, message: "Please enter VV Status" }] : undefined}>
                        <Input placeholder="VV Status" />
                      </Form.Item>
                    </Col>
                  </>
                )}
              </Row>
            )}
          </Collapse>
          {/* Status / call notes (CQ fields here when campaign has no campaign_questions) */}
          <Collapse defaultActiveKey={["compliance"]} expandIconPosition="end" style={{ marginTop: 16 }}>
            {renderSection(
              "compliance",
              useCampaignCq ? "Lead Status & Call Notes" : "Custom Questions",
              useCampaignCq ? "📋" : "✅",
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item label="Lead Status" name="status" initialValue="new">
                    <Select options={STATUS_OPTIONS} placeholder="Pipeline status" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Call Back" name="call_back">
                    <Input placeholder="Call Back" />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item label="Call Notes" name="call_notes">
                    <Input.TextArea rows={2} placeholder="Call Notes" />
                  </Form.Item>
                </Col>
                {!useCampaignCq && (
                  <>
                    <Col xs={24} sm={12}>
                      <Form.Item label="CQ1" name="cq1">
                        <Input placeholder="CQ1" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="CQ2" name="cq2">
                        <Input placeholder="CQ2" />
                      </Form.Item>
                    </Col>
                    {showMoreCq && (
                      <>
                        <Col xs={24} sm={12}>
                          <Form.Item label="CQ3" name="cq3">
                            <Input placeholder="CQ3" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item label="CQ4" name="cq4">
                            <Input placeholder="CQ4" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item label="CQ5" name="cq5">
                            <Input placeholder="CQ5" />
                          </Form.Item>
                        </Col>
                        {dynamicCqIndexes.map((cqIndex) => (
                          <Col xs={24} sm={12} key={`extra-cq-${cqIndex}`}>
                            <Form.Item label={`CQ${cqIndex}`} name={["extra_cq", `cq${cqIndex}`]}>
                              <Input
                                placeholder={`CQ${cqIndex}`}
                                suffix={
                                  <Button
                                    type="text"
                                    size="small"
                                    icon={<DeleteOutlined />}
                                    aria-label={`Remove CQ${cqIndex}`}
                                    onClick={() => removeDynamicCqField(cqIndex)}
                                  />
                                }
                              />
                            </Form.Item>
                          </Col>
                        ))}
                        <Col xs={24} sm={12} style={{ marginBottom: 24 }}>
                          <div style={{ paddingTop: 30 }}>
                            <Button
                              type="dashed"
                              icon={<PlusOutlined />}
                              onClick={addDynamicCqField}
                              aria-label="Add another custom question"
                              style={{ width: "100%", height: 32 }}
                            />
                          </div>
                        </Col>
                      </>
                    )}
                    <Col xs={24}>
                      {!showMoreCq && (
                        <Button
                          type="dashed"
                          icon={<PlusOutlined />}
                          onClick={() => setShowMoreCq(true)}
                          style={{ width: "100%" }}
                        >
                          Click to add more
                        </Button>
                      )}
                    </Col>
                  </>
                )}
              </Row>
            )}
          </Collapse>
          <Collapse defaultActiveKey={["voice-lock"]} expandIconPosition="end" style={{ marginTop: 16 }}>
            {renderSection(
              "voice-lock",
              "Voice Log",
              "🎧",
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {!canUseVoiceLock ? (
                  !hasLeadId ? (
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      Voice Log will be available after you create this lead and fill First Name, Last Name, Email Address, Company Name, and Domain.
                    </Typography.Text>
                  ) : (
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      To use Voice Log, please fill First Name, Last Name, Email Address, Company Name, and Domain for this lead.
                    </Typography.Text>
                  )
                ) : showAgentCallLogs && lead?.id ? (
                  <AgentCallLogCards ref={agentCallLogsRef} leadId={lead.id} />
                ) : (
                  <>
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      Upload up to 4 call recordings for this lead. Use the play and delete icons on each recording.
                    </Typography.Text>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        if (file) {
                          handleUploadVoice(file);
                        }
                      }}
                    />
                    <Row gutter={[12, 12]}>
                      {voiceRecordings.map((rec) => (
                        <Col key={rec.id} xs={24} sm={12}>
                          <div
                            style={{
                              border: "1px solid #f0f0f0",
                              borderRadius: 8,
                              padding: 10,
                              background: "#fafafa",
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  minWidth: 0,
                                }}
                              >
                                <PlayCircleOutlined style={{ color: "#4f46e5" }} />
                                <Typography.Text
                                  style={{
                                    fontSize: 13,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    maxWidth: 160,
                                  }}
                                >
                                  {rec.name}
                                </Typography.Text>
                              </span>
                              <Button
                                type="text"
                                danger
                                size="small"
                                icon={<DeleteOutlined />}
                                onClick={() => handleDeleteVoice(rec.path)}
                              />
                            </div>
                            {rec.url ? (
                              <audio
                                controls
                                src={rec.url}
                                style={{ width: "100%" }}
                              />
                            ) : (
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                Preview unavailable for this recording.
                              </Typography.Text>
                            )}
                          </div>
                        </Col>
                      ))}
                      {voiceRecordings.length < 4 && (
                        <Col xs={24} sm={12}>
                          <Button
                            type="dashed"
                            style={{ width: "100%", height: 80 }}
                            icon={<PlusOutlined />}
                            onClick={() => fileInputRef.current?.click()}
                            loading={voiceUploading}
                          >
                            Add call recording
                          </Button>
                        </Col>
                      )}
                    </Row>
                    {voiceLoading && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Spin size="small" />
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Loading recordings...
                        </Typography.Text>
                      </div>
                    )}
                  </>
                )}
              </div>,
              showAgentCallLogs ? (
                <Button
                  type="primary"
                  shape="circle"
                  size="small"
                  icon={<PlusOutlined />}
                  aria-label="Add call log"
                  style={{ width: 20, minWidth: 20, height: 20, fontSize: 10 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    agentCallLogsRef.current?.addCallLog();
                  }}
                />
              ) : undefined
            )}
          </Collapse>
          {/* QA Audit & Status — bottom of Contact column (collapsed by default for agents) */}
          <Collapse
            defaultActiveKey={isAgentEntry ? [] : ["audit"]}
            expandIconPosition="end"
            style={{ marginTop: 16 }}
          >
            {renderSection(
              "audit",
              "QA Audit & Status",
              "📋",
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item label="Asset Title" name="asset_title">
                    <Input placeholder="Asset Title" disabled={!canEditQaAudit} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Status" name="qa_status">
                    <Select
                      placeholder="Select QA Status"
                      options={QA_STATUS_OPTIONS}
                      allowClear
                      disabled={!canEditQaAudit}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Audit Date" name="audit_date">
                    <DatePicker style={{ width: "100%" }} disabled={!canEditQaAudit} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="QA Auditor"
                    name="qa_name"
                    tooltip="Set when this lead is audited; preserved per lead across QA users"
                  >
                    <Input
                      placeholder={hasRole("qa") ? loggedInQaName || "QA user" : "—"}
                      disabled
                      style={{ color: "rgba(0,0,0,0.65)", backgroundColor: "#fafafa" }}
                    />
                  </Form.Item>
                </Col>
                {lead?.qa_audited_at ? (
                  <Col xs={24} sm={12}>
                    <Form.Item label="QA Audit Date">
                      <Input
                        disabled
                        value={new Date(lead.qa_audited_at).toLocaleString()}
                        style={{ color: "rgba(0,0,0,0.65)", backgroundColor: "#fafafa" }}
                      />
                    </Form.Item>
                  </Col>
                ) : null}
                {!isAgentEntry && (
                  <>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Tenurity" name="tenurity">
                        <Input placeholder="Tenurity" disabled={!canEditQaAudit} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="VV Status" name="vv_status">
                        <Input placeholder="VV Status" disabled={!canEditQaAudit} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Email Status" name="email_status">
                        <Input placeholder="Email Status" disabled={!canEditQaAudit} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="EV Tool" name="ev_tool">
                        <Input placeholder="EV Tool" disabled={!canEditQaAudit} />
                      </Form.Item>
                    </Col>
                  </>
                )}
                <Col xs={24} sm={12}>
                  <Form.Item label="Primary Reason" name="primary_reason">
                    <Input placeholder="Primary Reason" disabled={!canEditQaAudit} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Secondary Reason" name="secondary_reason">
                    <Input placeholder="Secondary Reason" disabled={!canEditQaAudit} />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item label="QA Comments" name="qa_comments">
                    <Input.TextArea rows={3} placeholder="QA Comments" disabled={!canEditQaAudit} />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item noStyle shouldUpdate={(prev, curr) => prev.qa_status !== curr.qa_status}>
                    {({ getFieldValue }) =>
                      getFieldValue("qa_status") === "disqualified" ? (
                        <Row gutter={16}>
                          <Col xs={24}>
                            <Form.Item
                              name="disqualification_reasons"
                              label="Disqualification Reasons"
                            >
                              <Select
                                mode="multiple"
                                placeholder="Select reasons"
                                options={QA_AUDIT_DISQUALIFICATION_OPTIONS}
                                allowClear
                                disabled={!canEditQaAudit}
                              />
                            </Form.Item>
                          </Col>
                          <Col xs={24}>
                            <Form.Item
                              name="disqualification_reason"
                              label="Disqualification Reason"
                            >
                              <Input.TextArea rows={3} placeholder="Disqualification Reason" disabled={!canEditQaAudit} />
                            </Form.Item>
                          </Col>
                        </Row>
                      ) : null
                    }
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item noStyle shouldUpdate={(prev, curr) => prev.qa_status !== curr.qa_status}>
                    {({ getFieldValue }) =>
                      getFieldValue("qa_status") === "rectified" ? (
                        <Form.Item name="rectified_reason" label="Rectified Reason">
                          <Input.TextArea rows={3} placeholder="Rectified Reason" disabled={!canEditQaAudit} />
                        </Form.Item>
                      ) : null
                    }
                  </Form.Item>
                </Col>
              </Row>
            )}
          </Collapse>
        </Col>
        <Col xs={24} md={12}>
          <Collapse defaultActiveKey={["company"]} expandIconPosition="end">
            {renderSection(
              "company",
              "Company Information",
              "🏢",
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item label="Company Name" name="company_name" rules={[{ required: true, message: "Please enter Company Name" }]}>
                    <Input placeholder="Company name" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Domain" name="domain" rules={[{ required: true, message: "Please enter Domain" }]}>
                    <Input placeholder="example.com" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="Corporate Number"
                    name="company_number"
                    rules={isAgentCampaignCreate ? [{ required: true, message: "Please enter Corporate Number" }, ...phoneNumericFormRules("Corporate Number")] : isAgentEntry ? phoneNumericFormRules("Corporate Number") : undefined}
                    normalize={isAgentEntry ? normalizePhoneNumeric : undefined}
                  >
                    <Input placeholder="Company phone" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Phone Number Link" name="phone_number_link">
                    <Input placeholder="URL" />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <LeadAddressLineField form={form} required={isAgentCampaignCreate} />
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="City" name="city" rules={isAgentCampaignCreate ? [{ required: true, message: "Please enter City" }] : undefined}>
                    <Input placeholder="City" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="State" name="state" rules={isAgentCampaignCreate ? [{ required: true, message: "Please enter State" }] : undefined}>
                    <Input placeholder="State / Region" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Country" name="country" rules={[{ required: true, message: "Please enter Country" }]}>
                    <Input placeholder="Country" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Zip / Postal Code" name="zip_code" rules={isAgentCampaignCreate ? [{ required: true, message: "Please enter Zip / Postal Code" }] : undefined}>
                    <Input placeholder="e.g. 90210, SW1A 1AA" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Employee Size" name="employee_size">
                    <Select placeholder="Select" options={EMPLOYEE_SIZE_OPTIONS} allowClear />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="See All Employees" name="see_all_employees">
                    <Input placeholder="See All Employees" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Industry Type" name="industry">
                    <Input placeholder="Industry" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <LeadUrlFormField
                    form={form}
                    name="employee_size_link"
                    label="Employee Size Link"
                    placeholder="URL"
                    showOpenLink={showOpenLink}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <LeadUrlFormField
                    form={form}
                    name="company_website_link"
                    label="Company Website Link"
                    placeholder="https://company.com"
                    showOpenLink={showOpenLink}
                    required={isAgentCampaignCreate}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="Founded Year"
                    name="founded_years"
                    rules={isAgentEntry ? digitsOnlyFormRules("Founded Year") : undefined}
                    normalize={isAgentEntry ? normalizeDigitsOnly : undefined}
                  >
                    <Input placeholder="e.g. 2010" inputMode="numeric" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Founded Year Link" name="founded_years_link">
                    <Input placeholder="URL" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Revenue Size" name="revenue_range">
                    <Input placeholder="e.g. $1M - $5M" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Revenue Link" name="revenue_link">
                    <Input placeholder="URL" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="SIC Code" name="sic_code">
                    <Input placeholder="SIC Code" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="SIC Code Link" name="sic_code_link">
                    <Input placeholder="URL" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="NAICS Code" name="naics_code">
                    <Input placeholder="NAICS Code" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="NAICS Code Link" name="naics_code_link">
                    <Input placeholder="URL" />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <LeadUrlFormField
                    form={form}
                    name="company_linkedin_url"
                    label="Company LinkedIn URL"
                    placeholder="https://linkedin.com/company/..."
                    showOpenLink={showOpenLink}
                    required={isAgentCampaignCreate}
                  />
                </Col>
                <Col xs={24}>
                  <Form.Item
                    label={LEAD_MEETING_SET_DATE_TIME_LABEL}
                    tooltip="The time you enter is interpreted in the selected time zone and stored in UTC."
                    style={{ marginBottom: 16 }}
                  >
                    <Row gutter={[8, 8]}>
                      <Col xs={24} lg={14}>
                        <Form.Item name="scored" noStyle>
                          <DatePicker
                            showTime
                            style={{ width: "100%" }}
                            format="YYYY-MM-DD HH:mm"
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} lg={10}>
                        <Form.Item
                          name="scored_timezone"
                          noStyle
                          initialValue={getDefaultLeadTimezone()}
                        >
                          <LeadTimezoneSelect
                            knownValue={lead?.scored_timezone}
                            onChange={(newTz: string) => {
                              const oldTz =
                                previousScoredTzRef.current || getDefaultLeadTimezone();
                              const current = form.getFieldValue("scored") as
                                | Dayjs
                                | undefined;
                              const next = translateWallClockDayjs(current, oldTz, newTz);
                              if (next) {
                                form.setFieldValue("scored", next);
                              }
                              previousScoredTzRef.current = newTz;
                            }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item
                    label={LEAD_MEETING_DATE_TIME_LABEL}
                    tooltip="The time you enter is interpreted in the selected time zone and stored in UTC."
                    style={{ marginBottom: 16 }}
                  >
                    <Row gutter={[8, 8]}>
                      <Col xs={24} lg={14}>
                        <Form.Item name="appointment" noStyle>
                          <DatePicker
                            showTime
                            style={{ width: "100%" }}
                            format="YYYY-MM-DD HH:mm"
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} lg={10}>
                        <Form.Item
                          name="appointment_timezone"
                          noStyle
                          initialValue={getDefaultLeadTimezone()}
                        >
                          <LeadTimezoneSelect
                            knownValue={lead?.appointment_timezone}
                            onChange={(newTz: string) => {
                              const oldTz =
                                previousAppointmentTzRef.current || getDefaultLeadTimezone();
                              const current = form.getFieldValue("appointment") as
                                | Dayjs
                                | undefined;
                              const next = translateWallClockDayjs(current, oldTz, newTz);
                              if (next) {
                                form.setFieldValue("appointment", next);
                              }
                              previousAppointmentTzRef.current = newTz;
                            }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Form.Item>
                </Col>
                {showLeadTypeField && isAgentEntry && (
                  <Col xs={24} sm={12}>
                    <Form.Item
                      label="Lead Type"
                      name="lead_type"
                      rules={[{ required: true, message: "Please select Lead Type" }]}
                    >
                      {leadTypeOptions.length > 0 ? (
                        <Select
                          placeholder="Select lead type"
                          options={leadTypeOptions}
                          allowClear
                          showSearch
                          optionFilterProp="label"
                        />
                      ) : (
                        <Input placeholder="Enter lead type" />
                      )}
                    </Form.Item>
                  </Col>
                )}
                <Col xs={24} sm={12}>
                  <Form.Item label="Lead Tagging" name="lead_tagging" rules={[{ required: true, message: "Please select Lead Tagging" }]}>
                    <Select
                      placeholder="Select tag"
                      options={leadTaggingOptions}
                      allowClear
                      style={isCloudThatAg ? { width: "100%" } : undefined}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item label="RA Comment" name="ra_comment">
                    <Input.TextArea rows={2} placeholder="RA Comment" />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item label={LEAD_MEETING_NOTES_LABEL} name="special_comments">
                    <Input.TextArea rows={2} placeholder={LEAD_MEETING_NOTES_LABEL} />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <div
                    style={{
                      marginTop: 8,
                      paddingTop: 12,
                      borderTop: "1px dashed #f0f0f0",
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <Typography.Text strong style={{ fontSize: 13 }}>
                      📝 LHO (Lead Handover Sheet)
                    </Typography.Text>
                    {!lead?.id ? (
                      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                        LHO upload will be available after you create this lead.
                      </Typography.Text>
                    ) : (
                      <>
                        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                          Upload up to 4 handover documents (PDF, Word, Excel, images, etc.) linked to this lead.
                        </Typography.Text>
                        <input
                          ref={lhoInputRef}
                          type="file"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            if (file) {
                              handleUploadLho(file);
                            }
                          }}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {lhoFiles.map((f) => (
                              <div
                                key={f.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "6px 10px",
                                  borderRadius: 6,
                                  border: "1px solid #f0f0f0",
                                  background: "#fafafa",
                                  maxWidth: "100%",
                                }}
                              >
                                <FileOutlined style={{ color: "#6b7280" }} />
                                {f.url ? (
                                  <a
                                    href={f.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      fontSize: 13,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      maxWidth: 220,
                                    }}
                                  >
                                    {f.name}
                                  </a>
                                ) : (
                                  <Typography.Text
                                    style={{
                                      fontSize: 13,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      maxWidth: 220,
                                    }}
                                  >
                                    {f.name}
                                  </Typography.Text>
                                )}
                                {typeof f.size === "number" && (
                                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                    {(f.size / 1024).toFixed(1)} KB
                                  </Typography.Text>
                                )}
                                <Button
                                  type="text"
                                  danger
                                  size="small"
                                  icon={<DeleteOutlined />}
                                  onClick={() => handleDeleteLho(f.path)}
                                />
                              </div>
                            ))}
                          </div>
                          {lhoFiles.length < 4 && (
                            <Button
                              type="dashed"
                              icon={<UploadOutlined />}
                              onClick={() => lhoInputRef.current?.click()}
                              loading={lhoUploading}
                              style={{ alignSelf: "flex-start" }}
                            >
                              Upload LHO file
                            </Button>
                          )}
                          {lhoLoading && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Spin size="small" />
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                Loading LHO files...
                              </Typography.Text>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </Col>
              </Row>
            )}
          </Collapse>
        </Col>
      </Row>

      {showDemandSection && (
        <Collapse
          defaultActiveKey={["campaign-cq"]}
          expandIconPosition="end"
          style={{ marginBottom: 16 }}
        >
          {renderSection(
            "campaign-cq",
            DEMAND_QUALIFICATION_INSIGHTS_LABEL,
            "❓",
            <CampaignCqAnswerFields questions={campaignQuestions!} />
          )}
        </Collapse>
      )}

      <Form.Item label="Notes" name="notes" style={{ marginTop: 24 }}>
        <Input.TextArea rows={3} placeholder="Notes, context, objections..." />
      </Form.Item>

      <GenerateLhoButton
        form={form}
        lead={lead}
        campaignQuestions={campaignQuestions}
        campaignName={campaignName}
      />
    </Form>
  );
}

// ── Generate LHO Button ───────────────────────────────────────────────────────

function GenerateLhoButton({
  form,
  lead,
  campaignQuestions = null,
  campaignName = null,
}: {
  form: ReturnType<typeof Form.useForm>[0];
  lead?: Lead | null;
  campaignQuestions?: CampaignQuestion[] | null;
  campaignName?: string | null;
}) {
  const [generating, setGenerating] = useState(false);
  const { roles, profile, user } = useAuth();

  const firstName = Form.useWatch("first_name", form);
  const lastName = Form.useWatch("last_name", form);
  const companyName = Form.useWatch("company_name", form);

  const hasMinFields =
    (typeof firstName === "string" && firstName.trim().length > 0) ||
    (typeof lastName === "string" && lastName.trim().length > 0) ||
    (typeof companyName === "string" && companyName.trim().length > 0);

  const handleGenerate = async () => {
    const v = form.getFieldsValue() as Record<string, unknown>;
    const scoredTz =
      (typeof v.scored_timezone === "string" && v.scored_timezone.trim()) ||
      getDefaultLeadTimezone();
    const appointmentTz =
      (typeof v.appointment_timezone === "string" && v.appointment_timezone.trim()) ||
      getDefaultLeadTimezone();

    const raw: Record<string, unknown> = {
      ...(lead as Record<string, unknown> | undefined),
      ...v,
      campaign_questions: campaignQuestions ?? undefined,
      scored: wallClockDayjsToUtcIso(
        v.scored as Parameters<typeof wallClockDayjsToUtcIso>[0],
        scoredTz
      ),
      appointment: wallClockDayjsToUtcIso(
        v.appointment as Parameters<typeof wallClockDayjsToUtcIso>[0],
        appointmentTz
      ),
      scored_timezone: scoredTz,
      appointment_timezone: appointmentTz,
      creator_display_name:
        (lead as Record<string, unknown> | null | undefined)?.creator_display_name ??
        (profile as { full_name?: string | null } | null)?.full_name ??
        user?.email ??
        null,
    };

    const data = buildLhoDataFromLead(raw, { campaignQuestions, campaignName });

    setGenerating(true);
    try {
      const shouldUseClientLogo = shouldGenerateLhoPdfWithLogo(
        roles.map((r) => r.role_name)
      );
      const clientLogoUrl = shouldUseClientLogo
        ? ((profile as { client_logo_url?: string | null } | null)?.client_logo_url ?? null)
        : null;
      await generateLhoPdf(data, { logoSrc: clientLogoUrl });
      message.success("Meeting Report PDF downloaded successfully");
    } catch (err) {
      console.error("LHO generation error:", err);
      message.error("Failed to generate Meeting Report PDF");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      data-tour="agent-lho-pdf"
      style={{
        marginTop: 24,
        paddingTop: 20,
        borderTop: "1px dashed #f0f0f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 12,
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        Generate a Meeting Report PDF from the current form data.
      </Typography.Text>
      <Button
        icon={<FilePdfOutlined />}
        loading={generating}
        disabled={!hasMinFields}
        onClick={handleGenerate}
        style={
          hasMinFields
            ? { background: "#1b2530", borderColor: "#0ea5e9", color: "#0ea5e9" }
            : undefined
        }
      >
        Generate Meeting Report
      </Button>
    </div>
  );
}
