import { createHash, randomBytes } from "crypto";
import { MFA_BACKUP_CODE_COUNT } from "@/lib/mfa/constants";

function getBackupCodePepper(): string {
  return process.env.MFA_BACKUP_CODE_PEPPER?.trim() ?? "gandiv-mfa-backup-pepper";
}

/** Normalize to XXXX-XXXX (accepts with/without hyphen/spaces). */
export function normalizeBackupCodeInput(input: string): string {
  const raw = input.trim().toUpperCase().replace(/[^A-F0-9]/g, "");
  if (raw.length === 8) {
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  }
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export function hashBackupCode(code: string): string {
  const normalized = normalizeBackupCodeInput(code).toLowerCase();
  return createHash("sha256")
    .update(`${normalized}:${getBackupCodePepper()}`)
    .digest("hex");
}

export function generateBackupCodes(count = MFA_BACKUP_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(4).toString("hex").toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}
