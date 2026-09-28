"use client";

import { Alert } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";

/**
 * Slim countdown banner shown on admin pages while the emergency network
 * override is active. Renders nothing otherwise (or for non-admins — the
 * settings endpoint 403s and the query just stays empty).
 */
export default function NetworkOverrideBanner() {
  const { data } = useQuery({
    queryKey: ["admin", "network-settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/network/settings", { credentials: "include" });
      if (!res.ok) return null;
      return (await res.json()) as {
        policy: { emergency_override_until: string | null };
      };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const until = data?.policy?.emergency_override_until ?? null;
  if (!until) return null;
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return null;

  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  const remaining = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <Alert
      banner
      type="warning"
      showIcon
      icon={<ThunderboltOutlined />}
      message={`Emergency network override active — agents can work from any network for the next ${remaining}. Manage in Settings → Network Access.`}
    />
  );
}
