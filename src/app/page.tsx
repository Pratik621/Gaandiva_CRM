"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authDebug } from "@/lib/auth/debug";
import { buildLoginRedirectPath } from "@/lib/auth/config";

export default function HomePage() {
  const router = useRouter();
  const { isInitialized, isLoading, user, getDefaultRedirect } = useAuth();

  useEffect(() => {
    if (!isInitialized || isLoading) return;
    if (!user) {
      const loginPath = buildLoginRedirectPath("/");
      authDebug("home", "redirect anonymous user", { loginPath });
      router.replace(loginPath);
      return;
    }

    const path = getDefaultRedirect();
    authDebug("home", "redirect authenticated user", { path });
    router.replace(path);
  }, [getDefaultRedirect, isInitialized, isLoading, router, user]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-pulse text-slate-400">Redirecting...</div>
    </div>
  );
}
