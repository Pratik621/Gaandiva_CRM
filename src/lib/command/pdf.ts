/**
 * Consent Compliance PDF Builder
 *
 * Uses @react-pdf/renderer v4 via React.createElement so this module can
 * remain a plain .ts file (no JSX transform needed in API routes).
 *
 * Returns a Buffer — set Content-Type: application/pdf on the response.
 */

import React from "react";
// @react-pdf/renderer runs server-side only; never imported on the client
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import crypto from "node:crypto";

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 40,
    color: "#1a1a1a",
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: "#4f46e5",
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a8a",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#6b7280",
  },
  section: {
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a8a",
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#dbeafe",
    paddingBottom: 3,
  },
  row: {
    flexDirection: "row",
    marginBottom: 3,
  },
  label: {
    width: 140,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
  },
  value: {
    flex: 1,
    color: "#1f2937",
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  badgeGreen: { backgroundColor: "#d1fae5", color: "#065f46" },
  badgeRed: { backgroundColor: "#fee2e2", color: "#b91c1c" },
  badgeYellow: { backgroundColor: "#fef9c3", color: "#b45309" },
  historyRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    paddingVertical: 4,
  },
  historyDate: { width: 120, color: "#6b7280", fontSize: 9 },
  historyType: { width: 100, fontFamily: "Helvetica-Bold" },
  historyReason: { flex: 1, color: "#4b5563" },
  hashBox: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "#f0f9ff",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  hashLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#0369a1",
    marginBottom: 4,
  },
  hashValue: {
    fontSize: 7,
    color: "#0c4a6e",
    fontFamily: "Courier",
    wordBreak: "break-all",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 8, color: "#9ca3af" },
  watermark: {
    position: "absolute",
    top: "40%",
    left: "10%",
    fontSize: 48,
    color: "#e5e7eb",
    fontFamily: "Helvetica-Bold",
    opacity: 0.15,
    transform: "rotate(-30deg)",
  },
});

// ─── Data types ────────────────────────────────────────────────────────────

export interface ConsentPDFData {
  lead: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    status: string;
    consent_status: string | null;
    channel?: string | null;
    created_at: string;
  };
  campaign: {
    name: string;
    campaign_id?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  };
  consentRecords: Array<{
    consent_method?: string | null;
    consent_given_at?: string | null;
    ip_address?: string | null;
    recording_url?: string | null;
    consent_text?: string | null;
    sha256_hash?: string | null;
  }>;
  history: Array<{
    change_type: string;
    old_value?: unknown;
    new_value?: unknown;
    reason?: string | null;
    created_at: string;
  }>;
  generatedAt: string;
}

// ─── SHA-256 payload hash ──────────────────────────────────────────────────

export function computeConsentHash(data: ConsentPDFData): string {
  const payload = JSON.stringify({
    lead_id: data.lead.id,
    lead_name: data.lead.name,
    consent_status: data.lead.consent_status,
    consentRecords: data.consentRecords,
    generatedAt: data.generatedAt,
  });
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

// ─── Helper: field row ─────────────────────────────────────────────────────

function fieldRow(label: string, value: string) {
  return React.createElement(
    View,
    { style: styles.row },
    React.createElement(Text, { style: styles.label }, label),
    React.createElement(Text, { style: styles.value }, value || "—")
  );
}

// ─── Document factory ──────────────────────────────────────────────────────

function buildDocument(data: ConsentPDFData, hash: string) {
  const consent = data.consentRecords[0];
  const consentStatusStyle =
    data.lead.consent_status === "verified"
      ? styles.badgeGreen
      : data.lead.consent_status === "missing"
        ? styles.badgeRed
        : styles.badgeYellow;

  return React.createElement(
    Document,
    { title: `Consent Compliance — ${data.lead.name}` },
    React.createElement(
      Page,
      { size: "A4", style: styles.page },

      // Watermark
      React.createElement(Text, { style: styles.watermark }, "COMPLIANCE RECORD"),

      // Header
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(Text, { style: styles.title }, "Consent Compliance Report"),
        React.createElement(
          Text,
          { style: styles.subtitle },
          `Generated: ${new Date(data.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`
        )
      ),

      // Lead Information
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Lead Information"),
        fieldRow("Lead ID", data.lead.id),
        fieldRow("Name", data.lead.name),
        fieldRow("Email", data.lead.email ?? ""),
        fieldRow("Phone", data.lead.phone ?? ""),
        fieldRow("Channel", data.lead.channel ?? ""),
        fieldRow(
          "Status",
          data.lead.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.label }, "Consent Status"),
          React.createElement(
            Text,
            { style: { ...styles.badge, ...consentStatusStyle } },
            (data.lead.consent_status ?? "pending").toUpperCase()
          )
        ),
        fieldRow("Created At", new Date(data.lead.created_at).toLocaleString("en-IN"))
      ),

      // Campaign Information
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Campaign Information"),
        fieldRow("Campaign Name", data.campaign.name),
        fieldRow("Campaign ID", data.campaign.campaign_id ?? ""),
        fieldRow("Start Date", data.campaign.start_date ?? ""),
        fieldRow("End Date", data.campaign.end_date ?? "")
      ),

      // Consent Details
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Consent Details"),
        consent
          ? React.createElement(
              View,
              null,
              fieldRow("Consent Method", consent.consent_method ?? ""),
              fieldRow(
                "Consent Given At",
                consent.consent_given_at
                  ? new Date(consent.consent_given_at).toLocaleString("en-IN")
                  : ""
              ),
              fieldRow("IP Address", consent.ip_address ?? ""),
              fieldRow("Recording URL", consent.recording_url ?? ""),
              consent.consent_text
                ? React.createElement(
                    View,
                    { style: { marginTop: 6 } },
                    React.createElement(
                      Text,
                      { style: styles.label },
                      "Consent Text:"
                    ),
                    React.createElement(
                      Text,
                      { style: { ...styles.value, marginTop: 2, fontSize: 9 } },
                      consent.consent_text
                    )
                  )
                : null
            )
          : React.createElement(
              Text,
              { style: { color: "#ef4444", fontFamily: "Helvetica-Bold" } },
              "No consent record found."
            )
      ),

      // Audit History
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Audit History"),
        data.history.length === 0
          ? React.createElement(Text, { style: { color: "#9ca3af" } }, "No history entries.")
          : data.history.slice(0, 15).map((h, i) =>
              React.createElement(
                View,
                { key: String(i), style: styles.historyRow },
                React.createElement(
                  Text,
                  { style: styles.historyDate },
                  new Date(h.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })
                ),
                React.createElement(
                  Text,
                  { style: styles.historyType },
                  h.change_type.replace(/_/g, " ")
                ),
                React.createElement(
                  Text,
                  { style: styles.historyReason },
                  h.reason ?? ""
                )
              )
            )
      ),

      // Integrity Hash
      React.createElement(
        View,
        { style: styles.hashBox },
        React.createElement(Text, { style: styles.hashLabel }, "SHA-256 INTEGRITY HASH"),
        React.createElement(Text, { style: styles.hashValue }, hash),
        React.createElement(
          Text,
          { style: { ...styles.hashValue, marginTop: 4 } },
          "This hash uniquely identifies this consent payload. Any alteration will produce a different hash."
        )
      ),

      // Footer
      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(
          Text,
          { style: styles.footerText },
          `Lead: ${data.lead.id}`
        ),
        React.createElement(
          Text,
          { style: styles.footerText, render: ({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}` }
        ),
        React.createElement(
          Text,
          { style: styles.footerText },
          "CONFIDENTIAL — Internal Use Only"
        )
      )
    )
  );
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function generateConsentPDF(data: ConsentPDFData): Promise<Buffer> {
  const hash = computeConsentHash(data);
  const doc = buildDocument(data, hash);
  return renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
}
