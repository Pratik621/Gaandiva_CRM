"use client";

import { Typography } from "antd";

export default function AdminOrganizationsPage() {
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Organizations
        </Typography.Title>
        <Typography.Text type="secondary">
          Manage organizations and plans
        </Typography.Text>
      </div>
      <div
        style={{
          padding: 48,
          textAlign: "center",
          background: "#fff",
          borderRadius: 12,
          border: "1px dashed #d1d5db",
        }}
      >
        <Typography.Text type="secondary">
          Organizations management coming soon
        </Typography.Text>
      </div>
    </>
  );
}
