"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { EyeOutlined, EyeInvisibleOutlined, LockOutlined } from "@ant-design/icons";

const PASSWORD_MIN_LENGTH = 6;

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("This reset link is missing or invalid. Request a new one.");
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to reset password.");
        return;
      }
      setSuccess(true);
      setTimeout(() => router.replace("/login?reason=password_reset"), 1500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="login-page min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <p className="text-sm text-slate-700">This reset link is invalid.</p>
          <Link href="/auth/forgot-password" className="mt-4 inline-block text-sm font-medium underline">
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/60">
        <div className="flex justify-center mb-6">
          <Image
            src="/projects/gandiva_logo.png"
            alt="Gandiva"
            width={140}
            height={48}
            className="object-contain"
            priority
          />
        </div>

        <h1 className="text-xl font-semibold text-slate-900 tracking-tight text-center">
          Set a new password
        </h1>
        <p className="mt-2 text-sm text-slate-600 text-center">
          Choose a new password for your account.
        </p>

        {success ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 text-center">
            Password updated. Redirecting to sign in…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                New password
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <LockOutlined />
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 mb-2">
                Confirm password
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <LockOutlined />
                </span>
                <input
                  id="confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={submitting}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !password || !confirm}
              className="w-full py-3 px-4 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-700 disabled:opacity-60"
            >
              {submitting ? "Updating…" : "Update password"}
            </button>

            <Link href="/login" className="text-center text-sm text-slate-600 hover:text-slate-900">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
          <span className="text-sm text-slate-500">Loading…</span>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
