"use client";

import React, { useState } from "react";

const DEFAULT_MAX_LENGTH = 280;
const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

function renderTextWithLinks(text: string): React.ReactNode[] {
  const parts = text.split(URL_REGEX);
  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith("http://") || part.startsWith("https://")) {
      return (
        <a
          key={`url-${index}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#4f46e5", textDecoration: "underline", wordBreak: "break-all" }}
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={`text-${index}`}>{part}</React.Fragment>;
  });
}

type ExpandableTextProps = {
  text: string;
  maxLength?: number;
  style?: React.CSSProperties;
  /** Optional class for the container */
  className?: string;
  loadMoreLabel?: string;
  showLessLabel?: string;
};

/**
 * Renders text with a "Load more" / "Show less" toggle when content exceeds maxLength.
 * Preserves line breaks (white-space: pre-wrap).
 */
export function ExpandableText({
  text,
  maxLength = DEFAULT_MAX_LENGTH,
  style,
  className,
  loadMoreLabel = "Load more",
  showLessLabel = "Show less",
}: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  const needsToggle = text.length > maxLength;
  const displayText = needsToggle && !expanded ? text.slice(0, maxLength).trim() + "…" : text;

  return (
    <span className={className} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", ...style }}>
      {renderTextWithLinks(displayText)}
      {needsToggle && (
        <>
          {" "}
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "#4f46e5",
              fontSize: "inherit",
              fontWeight: 500,
            }}
          >
            {expanded ? showLessLabel : loadMoreLabel}
          </button>
        </>
      )}
    </span>
  );
}

/** Wrap long string overview values with ExpandableText; pass through other nodes as-is. */
export function renderExpandableOverviewValue(
  value: React.ReactNode,
  style?: React.CSSProperties,
  maxLength?: number
): React.ReactNode {
  if (typeof value === "string" && value.trim().length > 0) {
    return <ExpandableText text={value} style={style} maxLength={maxLength} />;
  }
  return value;
}
