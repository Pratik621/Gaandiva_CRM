"use client";

import { Descriptions } from "antd";
import { SKIP_RAW_DATA_KEYS, normalizeFieldKey, humanizeFieldKey } from "@/lib/marketing/lead-fields";

/**
 * Renders every raw_data field not already surfaced as a dedicated field
 * elsewhere in a lead's UI (name/phone/email/property/location) — ad name,
 * platform, the source platform's own lead status, inbox links, custom
 * qualifying questions, etc. Shared between the Marketing and Simplified
 * Agent lead views so both always show the exact same lead data.
 */
export default function AdditionalLeadDetails({
  rawData,
}: {
  rawData: Record<string, string> | null | undefined;
}) {
  const entries = Object.entries(rawData || {}).filter(
    ([key, value]) => value && !SKIP_RAW_DATA_KEYS.has(normalizeFieldKey(key))
  );

  if (entries.length === 0) return null;

  return (
    <Descriptions column={1} size="small" title="Additional Details" style={{ marginBottom: 24 }}>
      {entries.map(([key, value]) => (
        <Descriptions.Item key={key} label={humanizeFieldKey(key)}>
          {normalizeFieldKey(key) === "inbox url" ? (
            <a href={value} target="_blank" rel="noreferrer">
              Open conversation
            </a>
          ) : (
            value
          )}
        </Descriptions.Item>
      ))}
    </Descriptions>
  );
}
