"use client";

import { Layout } from "antd";
import { MfaGraceBannerGate } from "@/components/auth/MfaGraceBanner";
import NetworkOverrideBanner from "@/components/Admin/NetworkOverrideBanner";
import AdminSupportSidebar from "./AdminSupportSidebar";
import AdminSupportHeader from "./AdminSupportHeader";

const { Content } = Layout;

export default function AdminSupportLayout({ children }: { children: React.ReactNode }) {
  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      <AdminSupportSidebar />
      <Layout style={{ flex: 1, minWidth: 0, height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", marginLeft: 92 }}>
        <AdminSupportHeader />
        <MfaGraceBannerGate />
        <NetworkOverrideBanner />
        <Content style={{ flex: 1, margin: "24px", padding: 24, overflowY: "auto", overflowX: "auto", minWidth: 0, background: "#f5f5f5", borderRadius: 12 }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
