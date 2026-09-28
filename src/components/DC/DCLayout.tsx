"use client";

import { Layout } from "antd";
import DCSidebar from "./DCSidebar";
import DCHeader from "./DCHeader";
import { MfaGraceBannerGate } from "@/components/auth/MfaGraceBanner";

const { Content } = Layout;

export default function DCLayout({ children }: { children: React.ReactNode }) {
  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      <DCSidebar />
      <Layout style={{ flex: 1, minWidth: 0, height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", marginLeft: 92 }}>
        <DCHeader />
        <MfaGraceBannerGate />
        <Content style={{ flex: 1, margin: "24px", padding: 24, overflowY: "auto", overflowX: "auto", minWidth: 0, background: "#f5f5f5", borderRadius: 12 }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
