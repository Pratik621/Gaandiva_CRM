"use client";

import { Alert, Descriptions, Tag, Typography } from "antd";
import { CheckCircleFilled, CloseCircleFilled } from "@ant-design/icons";
import type { MetaTokenCheck } from "@/lib/marketing/meta-token-check";

const { Text } = Typography;

function Yes({ children }: { children: React.ReactNode }) {
  return (
    <span>
      <CheckCircleFilled style={{ color: "#16a34a", marginRight: 6 }} />
      {children}
    </span>
  );
}

function No({ children }: { children: React.ReactNode }) {
  return (
    <span>
      <CloseCircleFilled style={{ color: "#ef4444", marginRight: 6 }} />
      {children}
    </span>
  );
}

/**
 * Plain-language answer to "what can this Meta token do?": is it valid, can
 * it read lead data (Page, forms, a sample lead), can it send lead status
 * updates to the dataset, and which permissions are missing.
 */
export default function MetaTokenCheckResult({ check }: { check: MetaTokenCheck }) {
  if (!check.tokenValid) {
    return (
      <Alert
        type="error"
        showIcon
        message="Meta rejected this token"
        description={
          <>
            {check.error}
            <br />
            Re-copy the full token (it starts with &quot;EAA&quot;) and verify it at
            developers.facebook.com/tools/debug/accesstoken.
          </>
        }
      />
    );
  }

  return (
    <Descriptions column={1} size="small" bordered>
      <Descriptions.Item label="Token">
        <Yes>Valid</Yes>
      </Descriptions.Item>

      <Descriptions.Item label="Pages found">
        {check.discoveredPages.length === 0 ? (
          <No>None — the token isn&apos;t assigned to any Facebook Page</No>
        ) : (
          check.discoveredPages.map((p) => (
            <Tag key={p.id} color={p.id === check.page?.id ? "blue" : undefined} style={{ marginBottom: 4 }}>
              {p.name || "Page"} · {p.id}
            </Tag>
          ))
        )}
      </Descriptions.Item>

      <Descriptions.Item label="Read lead data">
        {check.canReadLeads ? (
          <Yes>
            Yes — Page {check.page?.name || "Page"} ({check.page?.id})
            {check.pageCorrectedFrom && (
              <Text type="warning" style={{ display: "block", fontSize: 12 }}>
                Saved Page ID {check.pageCorrectedFrom} is not a Page this token can access — using{" "}
                {check.page?.id} instead.
              </Text>
            )}
          </Yes>
        ) : (
          <No>
            No{check.leadsError ? ` — ${check.leadsError}` : ""}
          </No>
        )}
      </Descriptions.Item>

      {check.canReadLeads && (
        <Descriptions.Item label="Lead forms">
          {check.forms.length === 0 ? (
            <Text type="secondary">No lead forms on this Page yet</Text>
          ) : (
            <>
              {check.forms.map((form) => (
                <Tag key={form.id} style={{ marginBottom: 4 }}>
                  {form.name || form.id}
                </Tag>
              ))}
              <div style={{ marginTop: 4 }}>
                {check.sampleLeadFound && check.sampleLeadForm ? (
                  <Yes>
                    Real lead read from &quot;{check.sampleLeadForm.name || "Form"}&quot; ({check.sampleLeadForm.id})
                  </Yes>
                ) : (
                  <Text type="secondary">No leads on any form yet</Text>
                )}
              </div>
            </>
          )}
        </Descriptions.Item>
      )}

      <Descriptions.Item label="Send status to Meta">
        {!check.dataset ? (
          <Text type="secondary">No Dataset ID set</Text>
        ) : check.dataset.ok ? (
          <Yes>Yes — dataset {check.dataset.name || check.dataset.id}</Yes>
        ) : (
          <No>
            Dataset {check.dataset.id}: {check.dataset.error}
          </No>
        )}
      </Descriptions.Item>

      <Descriptions.Item label="Permissions">
        {check.permissions === null ? (
          <Text type="secondary">Not reported by Meta for this token type</Text>
        ) : (
          <>
            {check.permissions.map((p) => (
              <Tag key={p} color="green" style={{ marginBottom: 4 }}>
                {p}
              </Tag>
            ))}
            {check.missingLeadPermissions.map((p) => (
              <Tag key={p} color="red" style={{ marginBottom: 4 }}>
                missing: {p}
              </Tag>
            ))}
          </>
        )}
      </Descriptions.Item>
    </Descriptions>
  );
}
