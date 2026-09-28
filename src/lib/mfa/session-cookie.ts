import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { MFA_COOKIE_NAME } from "@/lib/mfa/constants";

const MFA_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type MfaCookiePayload = {
  uid: string;
  exp: number;
};

function getMfaSecret(): string {
  const secret = process.env.MFA_SESSION_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    console.warn("[mfa] MFA_SESSION_SECRET is not set — using insecure fallback");
  }
  return "dev-mfa-session-secret-change-me";
}

function signPayload(payload: MfaCookiePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getMfaSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function parseSignedCookie(value: string): MfaCookiePayload | null {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = createHmac("sha256", getMfaSecret()).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as MfaCookiePayload & {
      sid?: string;
    };
    if (!payload.uid || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return { uid: payload.uid, exp: payload.exp };
  } catch {
    return null;
  }
}

export function createMfaSessionCookieValue(userId: string): string {
  return signPayload({
    uid: userId,
    exp: Date.now() + MFA_SESSION_TTL_MS,
  });
}

export function setMfaSessionCookie(response: NextResponse, userId: string) {
  const value = createMfaSessionCookieValue(userId);
  response.cookies.set(MFA_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(MFA_SESSION_TTL_MS / 1000),
  });
}

export function clearMfaSessionCookie(response: NextResponse) {
  response.cookies.set(MFA_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function readMfaSessionFromRequest(request: NextRequest, userId: string): boolean {
  const raw = request.cookies.get(MFA_COOKIE_NAME)?.value;
  return isMfaCookieValidForUser(userId, raw);
}

/** Cookie is valid if signed, unexpired, and bound to this user. */
export function isMfaCookieValidForUser(
  userId: string,
  cookieValue: string | undefined
): boolean {
  if (!cookieValue) return false;
  const payload = parseSignedCookie(cookieValue);
  if (!payload) return false;
  return payload.uid === userId;
}
