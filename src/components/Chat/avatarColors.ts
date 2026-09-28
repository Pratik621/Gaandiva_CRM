/** Deterministic avatar backgrounds — no PII; company initials only in UI. */
const AVATAR_BGS = [
  "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
  "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)",
  "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
  "linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)",
];

export function avatarBackground(hue: number): string {
  return AVATAR_BGS[Math.abs(hue) % AVATAR_BGS.length];
}
