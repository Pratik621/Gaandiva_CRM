"use client";

import { Typography } from "antd";
import AdminNetworkAccessCard from "@/components/Admin/AdminNetworkAccessCard";

export default function AdminSettingsPage() {
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Settings
        </Typography.Title>
        <Typography.Text type="secondary">
          Admin and system settings
        </Typography.Text>
      </div>
      <AdminNetworkAccessCard />
    </>
  );
}
