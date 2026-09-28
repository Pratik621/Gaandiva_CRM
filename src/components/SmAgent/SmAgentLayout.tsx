"use client";

import { Layout } from "antd";
import SmAgentSidebar from "./SmAgentSidebar";
import SmAgentHeader from "./SmAgentHeader";
import { MfaGraceBannerGate } from "@/components/auth/MfaGraceBanner";

const { Content } = Layout;

interface SmAgentLayoutProps {
  children: React.ReactNode;
}

export default function SmAgentLayout({ children }: SmAgentLayoutProps) {
  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      <SmAgentSidebar />
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
        <SmAgentHeader />
        <MfaGraceBannerGate />
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
