import React from "react";
import { Tooltip } from "antd";

/** Truncated table cell with full value in tooltip (use with `ellipsis: true` + fixed `width` on column). */
export function tableEllipsisCell(
  value: string | null | undefined,
  fallback = "—"
): React.ReactNode {
  const text = (value ?? "").trim() || fallback;
  if (text === fallback) return text;
  return (
    <Tooltip title={text}>
      <span className="table-text-ellipsis" style={{ display: "block", width: "100%", maxWidth: "100%" }}>
        {text}
      </span>
    </Tooltip>
  );
}
