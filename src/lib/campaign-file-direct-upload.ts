/**
 * Upload campaign files directly to Supabase Storage, bypassing Vercel's
 * 4.5 MB function body limit.
 *
 * Flow:
 *  1. POST presignBase/presign  → get signed upload URLs (tiny JSON, no limit)
 *  2. PUT each file directly to Supabase Storage (no Vercel hop)
 *  3. POST presignBase/register → insert campaign_files DB rows
 */

export type DirectUploadResult = {
  uploaded: { id: string; file_name: string }[];
  errors: string[];
};

export async function uploadCampaignFilesDirect(
  /** Base path e.g. "/api/tl/campaigns/CAMPAIGN_ID/files" */
  presignBase: string,
  files: File[]
): Promise<DirectUploadResult> {
  const errors: string[] = [];

  if (files.length === 0) return { uploaded: [], errors };

  // ── Step 1: presign ────────────────────────────────────────────────────────
  const presignRes = await fetch(`${presignBase}/presign`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: files.map((f) => ({
        fileName: f.name,
        mimeType: f.type || "application/octet-stream",
        fileSize: f.size,
      })),
    }),
  });

  let presignData: {
    urls?: { signedUrl: string; path: string; fileName: string; mimeType: string; fileSize: number }[];
    errors?: string[];
  } = {};
  try {
    presignData = await presignRes.json();
  } catch {
    errors.push("Failed to prepare upload — server returned unexpected response");
    return { uploaded: [], errors };
  }

  if (!presignRes.ok) {
    errors.push((presignData as { error?: string }).error ?? "Failed to prepare upload");
    return { uploaded: [], errors };
  }

  if (presignData.errors?.length) errors.push(...presignData.errors);

  const signedUrls = presignData.urls ?? [];
  if (signedUrls.length === 0) return { uploaded: [], errors };

  // ── Step 2: direct upload to Supabase Storage ──────────────────────────────
  const fileMap = new Map(files.map((f) => [f.name, f]));
  const registered: { path: string; fileName: string; fileSize: number; mimeType: string }[] = [];

  for (const entry of signedUrls) {
    const file = fileMap.get(entry.fileName);
    if (!file) {
      errors.push(`${entry.fileName}: file not found locally`);
      continue;
    }

    const uploadRes = await fetch(entry.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": entry.mimeType },
      body: file,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      errors.push(
        `${entry.fileName}: upload failed (${uploadRes.status})${errText ? ` — ${errText.slice(0, 120)}` : ""}`
      );
      continue;
    }

    registered.push({
      path: entry.path,
      fileName: entry.fileName,
      fileSize: entry.fileSize,
      mimeType: entry.mimeType,
    });
  }

  if (registered.length === 0) return { uploaded: [], errors };

  // ── Step 3: register in campaign_files DB ──────────────────────────────────
  const registerRes = await fetch(`${presignBase}/register`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: registered }),
  });

  let registerData: { uploaded?: { id: string; file_name: string }[]; errors?: string[] } = {};
  try {
    registerData = await registerRes.json();
  } catch {
    errors.push("Files uploaded but could not register them — refresh the page");
    return { uploaded: [], errors };
  }

  if (!registerRes.ok) {
    errors.push((registerData as { error?: string }).error ?? "Files uploaded but registration failed");
    return { uploaded: [], errors };
  }

  if (registerData.errors?.length) errors.push(...registerData.errors);

  return { uploaded: registerData.uploaded ?? [], errors };
}
