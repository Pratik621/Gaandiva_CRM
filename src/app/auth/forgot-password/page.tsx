"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { MailOutlined } from "@ant-design/icons";

function ForgotPasswordContent() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        retryAfterMs?: number;
      };

      if (!res.ok) {
        if (res.status === 429 && data.retryAfterMs) {
          setCooldown(Math.ceil(data.retryAfterMs / 1000));
        }
        setError(data.error ?? "Something went wrong.");
        return;
      }

      setSuccess(
        data.message ??
          "If an account exists for that email, we sent a password reset link."
      );
      setCooldown(60);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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
          Forgot password
        </h1>
        <p className="mt-2 text-sm text-slate-600 text-center">
          Enter your work email and we&apos;ll send a reset link.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}
          {success && (
            <div
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
            >
              {success}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
              Email
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <MailOutlined />
              </span>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                disabled={submitting}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 outline-none transition disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !email.trim() || cooldown > 0}
            className="w-full py-3 px-4 rounded-xl bg-slate-800 text-white font-semibold transition hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting
              ? "Sending…"
              : cooldown > 0
                ? `Wait ${cooldown}s`
                : "Send reset link"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/login")}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Back to sign in
          </button>
        </form>

        {success && (
          <p className="mt-4 text-center text-xs text-slate-500">
            Didn&apos;t get it? Check spam, or wait for the cooldown and try again. Or{" "}
            <Link href="/login" className="underline">
              sign in
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
          <span className="text-sm text-slate-500">Loading…</span>
        </div>
      }
    >
      <ForgotPasswordContent />
    </Suspense>
  );
}
