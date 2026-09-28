"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button, Typography } from "antd";
import { StopOutlined } from "@ant-design/icons";
import { useAuth } from "@/context/AuthContext";

export default function DeviceRevokedPage() {
  const router = useRouter();
  const { isInitialized, user, signOut } = useAuth();

  useEffect(() => {
    if (!isInitialized) return;
    if (!user) {
      router.replace("/login");
    }
  }, [isInitialized, router, user]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
        <Image
          src="/projects/sidebar_logo.png"
          alt="Gandiv"
          width={48}
          height={48}
          className="mx-auto mb-4"
        />
        <StopOutlined className="text-3xl text-rose-500 mb-3" />
        <Typography.Title level={3} className="!mb-2">
          Device access removed
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!mb-6">
          This device is no longer allowed to access Gandiv. Contact your admin if you need access
          restored.
        </Typography.Paragraph>
        <Button
          type="primary"
          block
          size="large"
          onClick={() => {
            void signOut();
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
