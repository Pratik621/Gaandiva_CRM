"use client";

import React from "react";
import { Card, Space, Tag, Button, Typography } from "antd";
import { FileOutlined, DownloadOutlined } from "@ant-design/icons";

export type CampaignFileItem = {
  id: string;
  file_name: string;
  file_size: number | null;
  download_url: string | null;
};

const cardStyle = {
  marginBottom: 24,
  borderRadius: 8,
  border: "1px solid #f0f0f0",
  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
};

export function CampaignFilesCard({ files }: { files: CampaignFileItem[] }) {
  return (
    <Card
      title={
        <Space>
          <FileOutlined />
          <span>Files</span>
          <Tag style={{ marginLeft: 4 }}>{files.length}</Tag>
        </Space>
      }
      style={cardStyle}
      styles={{ body: { padding: "24px 28px" } }}
    >
      {files.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 16px", color: "#6b7280", fontSize: 14 }}>
          <FileOutlined style={{ fontSize: 40, marginBottom: 12, display: "block", color: "#d1d5db" }} />
          No files uploaded for this campaign.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {files.map((f, idx) => (
            <div
              key={f.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 0",
                borderBottom: idx < files.length - 1 ? "1px solid #f5f5f5" : "none",
                gap: 12,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                <FileOutlined style={{ color: "#6b7280", flexShrink: 0 }} />
                <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.file_name}
                </span>
                {f.file_size != null && (
                  <Typography.Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                    {(f.file_size / 1024).toFixed(1)} KB
                  </Typography.Text>
                )}
              </span>
              {f.download_url && (
                <Button
                  type="link"
                  size="small"
                  icon={<DownloadOutlined />}
                  href={f.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ padding: "0 4px", flexShrink: 0 }}
                >
                  Download
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
