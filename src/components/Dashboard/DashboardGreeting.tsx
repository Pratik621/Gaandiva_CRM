"use client";

import { useMemo, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type Props = {
  /** Fallback first name shown when profile hasn't loaded yet */
  fallback?: string;
  /** Optional right-side content (e.g. date filter) */
  extra?: ReactNode;
};

export default function DashboardGreeting({ fallback = "there", extra }: Props) {
  const { profile } = useAuth();

  const greeting = useMemo(getGreeting, []);
  const dateLabel = useMemo(formatDate, []);

  const firstName = profile?.full_name?.split(" ")[0] || fallback;

  return (
    <div
      style={{
        marginBottom: 28,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#9ca3af",
            letterSpacing: "0.01em",
            marginBottom: 4,
          }}
        >
          {dateLabel}
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: "#111827",
            lineHeight: 1.3,
          }}
        >
          {greeting}, {firstName} 👋
        </div>
      </div>
      {extra ? <div style={{ flexShrink: 0 }}>{extra}</div> : null}
    </div>
  );
}
