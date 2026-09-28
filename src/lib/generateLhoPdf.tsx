"use client";

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import { DEMAND_QUALIFICATION_INSIGHTS_LABEL } from "@/lib/campaign-questions";
import { LEAD_MEETING_NOTES_LABEL } from "@/lib/lead-field-labels";
import { formatFullAddress } from "@/lib/lho/meeting-report-format";

const BRAND_GREEN = "#2D5A4C";
const SECTION_BAR_BG = "#F9E8D4";
const DEFAULT_LOGO_SRC = "/projects/B2Bindemand_logo.png";

const LOGO_WIDTH = 148;

/** Reserved top space for the fixed logo on every page. */
const LOGO_HEADER_RESERVE = 88;

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    fontFamily: "Helvetica",
    paddingTop: LOGO_HEADER_RESERVE,
    paddingBottom: 48,
    paddingHorizontal: 48,
    color: "#1a1a1a",
  },
  pageLogo: {
    position: "absolute",
    top: 20,
    left: 48,
    right: 48,
    alignItems: "center",
  },
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  logoBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
    paddingBottom: 10,
  },
  logoImage: {
    width: LOGO_WIDTH,
    height: 55,
    objectFit: "contain",
  },
  reportTitleFirstPage: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: BRAND_GREEN,
    textAlign: "center",
    letterSpacing: 0.3,
    lineHeight: 1.35,
    marginTop: 4,
    marginBottom: 14,
  },
  body: {
    marginTop: 0,
  },
  metaBlock: {
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    marginBottom: 7,
    alignItems: "flex-start",
  },
  label: {
    width: 132,
    fontSize: 11,
    color: BRAND_GREEN,
    fontFamily: "Helvetica-Bold",
  },
  colon: {
    width: 8,
    fontSize: 11,
    color: BRAND_GREEN,
    fontFamily: "Helvetica-Bold",
  },
  value: {
    flex: 1,
    fontSize: 11,
    color: "#111827",
    fontFamily: "Helvetica",
    lineHeight: 1.35,
  },
  cqBlock: {
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e8e8e8",
  },
  cqQuestion: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: BRAND_GREEN,
    marginBottom: 4,
    lineHeight: 1.35,
  },
  cqAnswer: {
    fontSize: 11,
    color: "#111827",
    fontFamily: "Helvetica",
    lineHeight: 1.45,
  },
  sectionBar: {
    backgroundColor: SECTION_BAR_BG,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginTop: 16,
    marginBottom: 10,
  },
  sectionBarText: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: BRAND_GREEN,
    letterSpacing: 0.6,
  },
  content: {
    marginBottom: 32,
  },
});

export type LhoData = {
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  directNumber: string;
  jobTitle: string;
  jobLevel: string;
  department: string;
  jobFunction: string;
  jobTitleLink: string;
  contactLinkedIn: string;
  phoneNumberLink: string;
  channel: string;
  companyName: string;
  domain: string;
  companyNumber: string;
  address: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  employeeSize: string;
  seeAllEmployees: string;
  industry: string;
  employeeSizeLink: string;
  companyWebsite: string;
  companyLinkedIn: string;
  revenueRange: string;
  revenueLink: string;
  sicCode: string;
  sicCodeLink: string;
  naicsCode: string;
  naicsCodeLink: string;
  foundedYears: string;
  foundedYearsLink: string;
  callBack: string;
  callNotes: string;
  cq1: string;
  cq2: string;
  cq3: string;
  cq4: string;
  cq5: string;
  extraCq: Record<string, string>;
  campaignQuestions: { label: string; answer: string }[];
  leadDisposition: string;
  leadTagging?: string;
  assetTitle: string;
  tenurity: string;
  vvStatus: string;
  emailStatus: string;
  evTool: string;
  scoredAt?: string | null;
  scoredTimezone?: string | null;
  appointmentAt?: string | null;
  appointmentTimezone?: string | null;
  scored: string;
  appointment: string;
  client?: string;
  preparedBy?: string;
  agentName?: string;
  meetingSetDate?: string;
  meetingDate?: string;
  meetingTime?: string;
  raComment: string;
  specialComments: string;
  notes: string;
};

type PdfField = {
  label: string;
  value: string | undefined | null;
  multiline?: boolean;
};

function hasFieldValue(value: string | undefined | null): boolean {
  return value != null && String(value).trim().length > 0;
}

function FieldRow({ label, value }: { label: string; value: string | undefined | null }) {
  const v = value == null ? "" : String(value).trim();
  if (!v) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.colon}>:</Text>
      <Text style={styles.value}>{v}</Text>
    </View>
  );
}

function MultilineField({ label, value }: { label: string; value: string | undefined | null }) {
  const v = value == null ? "" : String(value).trim();
  if (!v) return null;
  return (
    <View style={styles.cqBlock}>
      <Text style={styles.cqQuestion}>{label}</Text>
      <Text style={styles.cqAnswer}>{v}</Text>
    </View>
  );
}

function FieldsSection({ title, fields }: { title: string; fields: PdfField[] }) {
  const visible = fields.filter((f) => hasFieldValue(f.value));
  if (visible.length === 0) return null;
  return (
    <>
      <SectionBar title={title} />
      {visible.map((field) =>
        field.multiline ? (
          <MultilineField key={field.label} label={field.label} value={field.value} />
        ) : (
          <FieldRow key={field.label} label={field.label} value={field.value} />
        )
      )}
    </>
  );
}

function SectionBar({ title }: { title: string }) {
  return (
    <View style={styles.sectionBar} wrap={false}>
      <Text style={styles.sectionBarText}>{title}</Text>
    </View>
  );
}

function CampaignQuestionsSection({
  rows,
}: {
  rows: { label: string; answer: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <SectionBar title={DEMAND_QUALIFICATION_INSIGHTS_LABEL} />
      {rows.map((row, index) => (
        <View
          key={`${row.label}-${index}`}
          style={
            index === rows.length - 1
              ? { ...styles.cqBlock, borderBottomWidth: 0, marginBottom: 0 }
              : styles.cqBlock
          }
        >
          <Text style={styles.cqQuestion}>{row.label}</Text>
          <Text style={styles.cqAnswer}>{row.answer}</Text>
        </View>
      ))}
    </>
  );
}

function PageLogo({ logoSrc }: { logoSrc?: string | null }) {
  return (
    <View style={styles.pageLogo} fixed>
      <View style={styles.logoWrap}>
        <View style={styles.logoBox}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image (not HTML img) */}
          <Image style={styles.logoImage} src={logoSrc || DEFAULT_LOGO_SRC} />
        </View>
      </View>
    </View>
  );
}

function LhoDocument({
  data,
  logoSrc,
  showClientName = false,
}: {
  data: LhoData;
  logoSrc?: string | null;
  showClientName?: boolean;
}) {
  const prospectName = [data.salutation, data.firstName, data.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const fullAddress = formatFullAddress({
    address: data.address,
    city: data.city,
    state: data.state,
    zipCode: data.zipCode,
    country: data.country,
  });
  const website = data.companyWebsite || data.domain;

  return (
    <Document title="Meeting Report">
      <Page size="A4" style={styles.page} wrap>
        <PageLogo logoSrc={logoSrc} />

        <View style={styles.body}>
          <Text style={styles.reportTitleFirstPage}>Meeting Report</Text>
          <View style={styles.content}>
            <FieldsSection
              title="MEETING DETAILS"
              fields={[
                ...(showClientName
                  ? [
                      { label: "Client", value: data.client },
                      { label: "Prepared by", value: data.preparedBy },
                    ]
                  : []),
                { label: "Scored Date & Time", value: data.meetingSetDate },
                { label: "Appointment Date & Time", value: data.meetingDate },
                { label: "Meeting Time", value: data.meetingTime },
                { label: "Agent Name", value: data.agentName },
                { label: "Lead Tagging", value: data.leadTagging },
                { label: "Asset Title", value: data.assetTitle },
                { label: "Lead Disposition", value: data.leadDisposition },
                { label: "Channel", value: data.channel },
              ]}
            />

            <FieldsSection
              title="PROSPECT INFORMATION"
              fields={[
                { label: "Name", value: prospectName },
                { label: "Job Title", value: data.jobTitle },
                { label: "Job Title Link", value: data.jobTitleLink },
                { label: "Email", value: data.email },
                { label: "Phone", value: data.phone },
                { label: "Direct Number", value: data.directNumber },
                { label: "LinkedIn", value: data.contactLinkedIn },
              ]}
            />

            <FieldsSection
              title="COMPANY INFORMATION"
              fields={[
                { label: "Account", value: data.companyName },
                { label: "Domain", value: data.domain },
                { label: "Company Number", value: data.companyNumber },
                { label: "Industry", value: data.industry },
                { label: "Employee Size", value: data.employeeSize },
                { label: "Employee Size Link", value: data.employeeSizeLink },
                { label: "Address", value: fullAddress },
                { label: "Website", value: website },
                { label: "Company LinkedIn", value: data.companyLinkedIn },
                { label: "Revenue Range", value: data.revenueRange },
                { label: "Revenue Link", value: data.revenueLink },
              ]}
            />

            <FieldsSection
              title="COMPLIANCE & VERIFICATION"
              fields={[
                { label: "Tenurity", value: data.tenurity },
                { label: "VV Status", value: data.vvStatus },
                { label: "Email Status", value: data.emailStatus },
                { label: "EV Tool", value: data.evTool },
              ]}
            />

            <FieldsSection
              title="CALL INFORMATION"
              fields={[
                { label: "Call Back", value: data.callBack },
                { label: "Call Notes", value: data.callNotes, multiline: true },
              ]}
            />

            <CampaignQuestionsSection rows={data.campaignQuestions} />

            <FieldsSection
              title="COMMENTS & NOTES"
              fields={[
                { label: "RA Comment", value: data.raComment, multiline: true },
                { label: LEAD_MEETING_NOTES_LABEL, value: data.specialComments, multiline: true },
                { label: "Notes", value: data.notes, multiline: true },
              ]}
            />

          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generateLhoPdf(
  data: LhoData,
  options?: { logoSrc?: string | null; showClientName?: boolean }
): Promise<void> {
  const doc = (
    <LhoDocument
      data={data}
      logoSrc={options?.logoSrc ?? null}
      showClientName={options?.showClientName ?? false}
    />
  );
  const blob = await pdf(doc).toBlob();

  const firstName = (data.firstName || "").trim();
  const lastName = (data.lastName || "").trim();
  const companyName = (data.companyName || "").trim();
  const fileName = `LHO_${firstName}_${lastName}_${companyName}.pdf`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
