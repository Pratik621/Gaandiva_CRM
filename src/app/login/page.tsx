"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { AUTH_STORAGE_KEYS, resolvePostLoginRedirect } from "@/lib/auth/config";
import { authDebug } from "@/lib/auth/debug";
import { fetchMfaStatus, ensureDeviceRegistered, resolvePostAuthPath } from "@/lib/mfa/resolve-post-auth";
import Link from "next/link";
import { MailOutlined, LockOutlined, EyeOutlined, EyeInvisibleOutlined } from "@ant-design/icons";
import LoginWorkflowIllustration from "@/components/login/LoginWorkflowIllustration";

function getStoredRedirectPath() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEYS.lastRedirectPath);
  } catch {
    return null;
  }
}

function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? undefined;
  const reason = searchParams.get("reason");
  const { isInitialized, user, roles, getDefaultRedirect, signIn } = useAuth();
  const redirectDone = useRef(false);

  const getResolvedRedirectPath = useCallback(
    () =>
      resolvePostLoginRedirect({
        requestedPath: redirect,
        storedPath: getStoredRedirectPath(),
        roleNames: roles.map((role) => role.role_name),
      }) || getDefaultRedirect(),
    [getDefaultRedirect, redirect, roles]
  );

  // Use SPA navigation (router.replace) so the auth state set by signIn() is
  // reused directly on the target page — no full page reload, no loading flash.
  const doRedirect = useCallback(
    (path: string) => {
      if (redirectDone.current) return;
      redirectDone.current = true;
      authDebug("login", "redirecting after auth", { path });
      router.replace(path);
    },
    [router]
  );

  const resolveAndNavigate = useCallback(
    async (basePath: string) => {
      const mfa = await fetchMfaStatus();
      // Only register/check device after MFA is satisfied (or not required)
      let device = null;
      if (!mfa?.needsSetup && !mfa?.needsChallenge) {
        device = await ensureDeviceRegistered();
      }
      doRedirect(resolvePostAuthPath(basePath, mfa, device));
    },
    [doRedirect]
  );

  useEffect(() => {
    if (!isInitialized || !user || redirectDone.current) return;
    void resolveAndNavigate(getResolvedRedirectPath());
  }, [getResolvedRedirectPath, isInitialized, resolveAndNavigate, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("You appear to be offline. Please check your internet connection and try again.");
      return;
    }

    if (!email.trim() || !password) {
      setError("Please enter email and password.");
      return;
    }

    setSubmitting(true);
    const timeoutMs = 15000;
    const timeoutResult = { error: new Error("Sign-in timed out. Please check your connection and try again.") as Error, redirectPath: undefined as string | undefined };
    const timeoutPromise = new Promise<typeof timeoutResult>((resolve) => {
      setTimeout(() => resolve(timeoutResult), timeoutMs);
    });

    try {
      const result = await Promise.race([
        signIn(email.trim(), password, redirect).then((r) => ({
          error: r.error,
          redirectPath: r.redirectPath,
        })),
        timeoutPromise,
      ]);

      if (result.error) {
        setError(result.error?.message || "Invalid email or password.");
        setSubmitting(false);
        return;
      }

      const path = result.redirectPath ?? getResolvedRedirectPath();
      doRedirect(path);
    } catch (err) {
      setError((err as Error).message || "Something went wrong while signing in.");
      setSubmitting(false);
    }
  };

  // Don't block render on isInitialized — if a user is already logged in,
  // the useEffect above fires doRedirect() immediately. Showing a full-screen
  // spinner here just makes the navigation delay visible without adding value.
  // The submit button's own "Signing in..." state covers the login flow.
  if (!isInitialized && !user) {
    return (
      <div className="login-page min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 rounded-full border-2 border-slate-200 border-t-slate-500 animate-spin" />
          <span className="text-sm text-slate-500">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page min-h-screen flex flex-col md:flex-row bg-[#f8fafc]">
      {/* Left panel - branding */}
      <div className="hidden md:flex md:w-[48%] lg:w-[52%] flex-col justify-between p-10 lg:p-14 border-r border-slate-200/80" style={{ backgroundColor: "#F2F4F5" }}>
        <div className="flex flex-col flex-1 min-h-0">
          <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            GTM OS
          </div>
          <h2 className="mt-12 text-3xl font-semibold tracking-tight text-slate-800 lg:text-4xl">
            Go-to-market, orchestrated.
          </h2>
          <p className="mt-4 max-w-sm text-base text-slate-600 leading-relaxed">
            Run campaigns, pipeline, and delivery from one operating system built for B2B revenue teams.
          </p>
          <div className="mt-8 relative w-full flex-1 min-h-0">
            <Image
              src="/projects/Corporate%20CRM%20Workflows%20Infographic%20Presentation.png"
              alt="Corporate CRM Workflows Infographic"
              fill
              className="object-contain"
              priority
              sizes="(max-width: 768px) 100vw, 52vw"
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Secure authentication · Role-based access
        </p>
      </div>

      {/* Right panel - form + illustration */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 md:p-10 w-full min-w-0">
        <div className="w-full max-w-[480px] min-w-0 px-1 sm:px-0 flex flex-col items-center">
          <div className="flex justify-center mb-4 sm:mb-6">
            <Image
              src="/projects/gandiva_logo.png"
              alt="Gandiva"
              width={160}
              height={56}
              className="object-contain w-[120px] h-auto sm:w-[140px] md:w-[160px]"
              priority
            />
          </div>
          <div className="md:hidden mb-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">GTM OS</p>
            <h1 className="mt-2 text-xl font-semibold text-slate-900 tracking-tight">
              Sign in to Gandiv
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Your go-to-market workspace for campaigns and pipeline
            </p>
          </div>

          <div
            data-login-card
            className="relative w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60 sm:p-8 md:p-10 overflow-hidden"
            style={{ boxSizing: "border-box" }}
          >
            <div className="login-card-hero">
              <div className="login-card-hero__art" aria-hidden>
                <LoginWorkflowIllustration />
              </div>
              <div className="login-card-hero__text">
                <h1 className="text-lg sm:text-xl font-semibold text-slate-900 tracking-tight leading-tight">
                  Sign in
                </h1>
                <p className="login-card-hero__subtitle">
                  Enter your credentials to continue
                </p>
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              className="relative z-10 flex flex-col gap-4 sm:gap-5 w-full min-w-0"
            >
              {reason === "password_reset" && !error && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                >
                  <span className="shrink-0 mt-0.5">✓</span>
                  <span>Password updated. Sign in with your new password.</span>
                </div>
              )}
              {reason === "session_expired" && !error && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                >
                  <span className="shrink-0 mt-0.5">⚠</span>
                  <span>Your session has expired. Please sign in again.</span>
                </div>
              )}
              {reason === "unauthorized" && !error && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                >
                  <span className="shrink-0 mt-0.5">⚠</span>
                  <span>Your account doesn&apos;t have access to that page. Please sign in with the correct account.</span>
                </div>
              )}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  <span className="shrink-0 mt-0.5">!</span>
                  <span>{error}</span>
                </div>
              )}

              <div className="w-full min-w-0">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Email
                </label>
                <div className="relative w-full">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <MailOutlined className="text-base" />
                  </span>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full min-w-0 pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 outline-none transition disabled:opacity-50"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="w-full min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Password
                  </label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative w-full">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <LockOutlined className="text-base" />
                  </span>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full min-w-0 pl-10 pr-10 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 outline-none transition disabled:opacity-50"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center p-0 border-0 bg-transparent shadow-none text-slate-400 hover:text-slate-600 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-1 rounded-md"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !email.trim() || !password}
                className="mt-1 w-full py-3 px-4 rounded-xl bg-slate-800 text-white font-semibold transition hover:bg-slate-700 focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
              >
                {submitting ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-400">
              Enterprise-grade sign-in · Role-based workspace access
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-page min-h-screen flex items-center justify-center bg-[#f8fafc]">
          <div className="flex flex-col items-center gap-3">
            <div className="h-9 w-9 rounded-full border-2 border-slate-200 border-t-slate-500 animate-spin" />
            <span className="text-sm text-slate-500">Loading...</span>
          </div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
