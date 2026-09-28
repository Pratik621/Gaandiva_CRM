/** Maps Postgres duplicate-key trigger errors to API 409 responses. */
export function isLeadDuplicateDbError(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = error.message ?? "";
  return message.includes("Duplicate lead");
}

export function leadDuplicateApiPayload(error: {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined): {
  error: string;
  message: string;
  duplicate_reason: string;
} {
  return {
    error: "Duplicate lead",
    message:
      error?.details ??
      error?.message ??
      "This lead already exists in this campaign and cannot be saved.",
    duplicate_reason: error?.hint ?? "Duplicate lead",
  };
}
