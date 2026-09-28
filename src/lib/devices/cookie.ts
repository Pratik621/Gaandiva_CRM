import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import {
  DEVICE_COOKIE_MAX_AGE_SEC,
  DEVICE_COOKIE_NAME,
  DEVICE_OK_COOKIE_NAME,
  DEVICE_OK_TTL_MS,
} from "@/lib/devices/constants";

type DeviceOkPayload = {
  uid: string;
  did: string;
  exp: number;
};

function getDeviceOkSecret(): string {
  const secret =
    process.env.DEVICE_OK_SECRET?.trim() || process.env.MFA_SESSION_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    console.warn("[devices] DEVICE_OK_SECRET is not set — using insecure fallback");
  }
  return "dev-device-ok-secret-change-me";
}

function signPayload(payload: DeviceOkPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getDeviceOkSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function parseSignedCookie(value: string): DeviceOkPayload | null {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = createHmac("sha256", getDeviceOkSecret()).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DeviceOkPayload;
    if (!payload.uid || !payload.did || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export function setDeviceTokenCookie(response: NextResponse, token: string) {
  response.cookies.set(DEVICE_COOKIE_NAME, token, {
    ...cookieBase,
    maxAge: DEVICE_COOKIE_MAX_AGE_SEC,
  });
}

export function clearDeviceTokenCookie(response: NextResponse) {
  response.cookies.set(DEVICE_COOKIE_NAME, "", {
    ...cookieBase,
    maxAge: 0,
  });
}

export function setDeviceOkCookie(
  response: NextResponse,
  userId: string,
  deviceId: string
) {
  const value = signPayload({
    uid: userId,
    did: deviceId,
    exp: Date.now() + DEVICE_OK_TTL_MS,
  });
  response.cookies.set(DEVICE_OK_COOKIE_NAME, value, {
    ...cookieBase,
    maxAge: Math.floor(DEVICE_OK_TTL_MS / 1000),
  });
}

export function clearDeviceOkCookie(response: NextResponse) {
  response.cookies.set(DEVICE_OK_COOKIE_NAME, "", {
    ...cookieBase,
    maxAge: 0,
  });
}

export function clearAllDeviceCookies(response: NextResponse) {
  clearDeviceTokenCookie(response);
  clearDeviceOkCookie(response);
}

export function readDeviceTokenFromRequest(request: NextRequest): string | undefined {
  return request.cookies.get(DEVICE_COOKIE_NAME)?.value;
}

export function isDeviceOkCookieValid(
  userId: string,
  deviceId: string,
  cookieValue: string | undefined
): boolean {
  if (!cookieValue) return false;
  const payload = parseSignedCookie(cookieValue);
  if (!payload) return false;
  return payload.uid === userId && payload.did === deviceId;
}

export function readDeviceOkFromRequest(
  request: NextRequest,
  userId: string
): { deviceId: string } | null {
  const raw = request.cookies.get(DEVICE_OK_COOKIE_NAME)?.value;
  if (!raw) return null;
  const payload = parseSignedCookie(raw);
  if (!payload || payload.uid !== userId) return null;
  return { deviceId: payload.did };
}
