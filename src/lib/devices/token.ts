import { createHash, randomBytes } from "crypto";

function getDeviceTokenPepper(): string {
  return (
    process.env.DEVICE_TOKEN_PEPPER?.trim() ||
    process.env.MFA_BACKUP_CODE_PEPPER?.trim() ||
    "gandiv-device-token-pepper"
  );
}

/** 256-bit random token (hex). */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashDeviceToken(token: string): string {
  const normalized = token.trim().toLowerCase();
  return createHash("sha256")
    .update(`${normalized}:${getDeviceTokenPepper()}`)
    .digest("hex");
}
