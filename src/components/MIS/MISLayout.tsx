"use client";

import { Layout } from "antd";
import MISSidebar from "./MISSidebar";
import MISHeader from "./MISHeader";
import { MfaGraceBannerGate } from "@/components/auth/MfaGraceBanner";

const { Content } = Layout;

interface MISLayoutProps {
  children: React.ReactNode;
}

export default function MISLayout({ children }: MISLayoutProps) {
  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      <MISSidebar />
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
        <MISHeader />
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

