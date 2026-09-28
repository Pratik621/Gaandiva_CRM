"use client";

import { Layout } from "antd";
import AdminSidebar from "./AdminSidebar";
import AdminHeader from "./AdminHeader";
import { MfaGraceBannerGate } from "@/components/auth/MfaGraceBanner";
import NetworkOverrideBanner from "@/components/Admin/NetworkOverrideBanner";

const { Content } = Layout;

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      <AdminSidebar />
      <Layout
        style={{
          flex: 1,
          minWidth: 0,
          height: "100vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          marginLeft: 92,
        }}
      >
        <AdminHeader />
        <MfaGraceBannerGate />
        <NetworkOverrideBanner />
        <Content
          style={{
            flex: 1,
            margin: "24px",
            padding: 24,
            overflowY: "auto",
            overflowX: "auto",
            minWidth: 0,
            background: "#f5f5f5",
            borderRadius: 12,
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
