"use client";

import { Layout } from "antd";
import STLSidebar from "./STLSidebar";
import STLHeader from "./STLHeader";
import { MfaGraceBannerGate } from "@/components/auth/MfaGraceBanner";

const { Content } = Layout;

interface STLLayoutProps {
  children: React.ReactNode;
}

export default function STLLayout({ children }: STLLayoutProps) {
  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      <STLSidebar />
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
        <STLHeader />
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
