"use client";

import AppLayout from "@/components/Dashboard/AppLayout";
import { useAuth } from "@/context/AuthContext";
import { Skeleton, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const { Text } = Typography;

const ALLOWED_ROLES = [
  "client_viewer",
  "internal_operator",
  "internal_admin",
  "admin",
  "qa",
  "mis",
  "sales",
  "sales_manager",
  "agent",
  "team_leader",
  "tl",
  "operations_manager",
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isInitialized, isLoading, hasRole, user } = useAuth();
  const router = useRouter();

  // `isAllowed` is only reliable once loading is finished (roles are populated then).
  const isAllowed = !isLoading && ALLOWED_ROLES.some((r) => hasRole(r));

  useEffect(() => {
    // Wait until auth is fully settled (user identity + roles confirmed).
    if (!isInitialized || isLoading) return;

    if (!user) {
      router.replace("/login?reason=session_expired");
      return;
    }

    if (!isAllowed) {
      router.replace("/login?reason=unauthorized");
    }
  }, [isInitialized, isLoading, user, isAllowed, router]);

  // Block ONLY until we know whether a user session exists.
  // `isInitialized` flips true as soon as either:
  //   a) the fast-path getSession() finds a stored session (< 1 ms), or
  //   b) the full server-side sync completes.
  // We no longer block on `isLoading` here — pages have their own skeletons
  // and useAuthReady() keeps them from firing real API calls until profile /
  // roles are ready. This eliminates the full-page spinner on tab-reopen.
  if (!isInitialized) {
    return (
      <AppLayout>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "8px 0 24px" }}>
          <Skeleton active title={{ width: "38%" }} paragraph={{ rows: 5 }} />
        </div>
      </AppLayout>
    );
  }

  // User not authenticated (fast-path found no session, or getUser failed).
  if (!user) {
    return (
      <AppLayout>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 280,
          }}
        >
          <Text type="secondary" style={{ fontSize: 14 }}>
            Redirecting to sign in…
          </Text>
        </div>
      </AppLayout>
    );
  }

  // Profile/roles are still loading (post fast-path). Render children so pages
  // can show their own skeletons — useAuthReady() keeps data fetches gated until
  // isLoading becomes false.
  if (isLoading) {
    return <AppLayout>{children}</AppLayout>;
  }

  // Roles confirmed — enforce authorization.
  if (!isAllowed) {
    return (
      <AppLayout>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 280,
          }}
        >
          <Text type="secondary" style={{ fontSize: 14 }}>
            Redirecting…
          </Text>
        </div>
      </AppLayout>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}
