"use client";

import { Layout } from "antd";
import MISTLSidebar from "./MISTLSidebar";
import MISTLHeader from "./MISTLHeader";
import { MfaGraceBannerGate } from "@/components/auth/MfaGraceBanner";

const { Content } = Layout;

interface MISTLLayoutProps {
  children: React.ReactNode;
}

export default function MISTLLayout({ children }: MISTLLayoutProps) {
  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      <MISTLSidebar />
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
        <MISTLHeader />
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

