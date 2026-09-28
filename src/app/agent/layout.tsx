"use client";

import AgentLayout from "@/components/Agent/AgentLayout";
import { AgentTourProvider } from "@/context/AgentTourContext";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Spin } from "antd";

export default function AgentRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useRoleGuard(["agent"]);

  return (
    <AgentTourProvider>
      <AgentLayout>
        {status === "loading" ? (
          <div className="min-h-[60vh] flex items-center justify-center">
            <Spin size="large" />
          </div>
        ) : status === "redirecting" ? (
          <div className="min-h-[60vh] flex items-center justify-center">
            <Spin size="large" tip="Redirecting..." />
          </div>
        ) : (
          children
        )}
      </AgentLayout>
    </AgentTourProvider>
  );
}

