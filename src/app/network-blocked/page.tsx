"use client";

import { Button, Result } from "antd";
import { GlobalOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function NetworkBlockedPage() {
  const router = useRouter();
  const { signOut } = useAuth();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc",
        padding: 24,
      }}
    >
      <Result
        icon={<GlobalOutlined style={{ color: "#4f46e5" }} />}
        status="warning"
        title="Office network required"
        subTitle="Gaandiva can only be accessed from the office network. Contact your admin if you believe this is an error."
        extra={[
          <Button key="retry" type="primary" onClick={() => router.push("/agent/dashboard")}>
            Try again
          </Button>,
          <Button key="signout" onClick={() => void signOut()}>
            Sign out
          </Button>,
        ]}
      />
    </div>
  );
}
