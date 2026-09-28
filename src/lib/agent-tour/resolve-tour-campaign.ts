export async function resolveTourCampaignId(): Promise<string | null> {
  try {
    const res = await fetch("/api/agent/campaigns?limit=1", { credentials: "include" });
    const json = (await res.json()) as { campaigns?: { id: string }[]; error?: string };
    if (!res.ok) return null;
    return json.campaigns?.[0]?.id ?? null;
  } catch {
    return null;
  }
}
