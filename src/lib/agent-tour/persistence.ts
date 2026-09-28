import {
  DEFAULT_AGENT_TOUR_PREFS,
  getAgentTourPreferences,
  setAgentTourPreferences,
  type AgentTourPreferences,
} from "@/lib/agent-tour/storage";

export type AgentTourPrefsPatch = Partial<
  Pick<AgentTourPreferences, "tour_completed" | "tour_dismissed">
>;

type RemoteTourPrefs = {
  tour_completed?: boolean;
  tour_dismissed?: boolean;
};

function mergeTourPrefs(
  local: AgentTourPreferences,
  remote: RemoteTourPrefs
): AgentTourPreferences {
  return {
    tour_completed: local.tour_completed || Boolean(remote.tour_completed),
    tour_dismissed: local.tour_dismissed || Boolean(remote.tour_dismissed),
  };
}

async function fetchRemoteTourPrefs(): Promise<RemoteTourPrefs | null> {
  try {
    const res = await fetch("/api/agent/product-tour", { credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as RemoteTourPrefs;
  } catch {
    return null;
  }
}

/** Load tour prefs: DB is source of truth, localStorage is cache/fallback. */
export async function hydrateAgentTourPreferences(
  userId: string
): Promise<AgentTourPreferences> {
  const local = getAgentTourPreferences(userId);
  const remote = await fetchRemoteTourPrefs();

  if (!remote) {
    return local;
  }

  const merged = mergeTourPrefs(local, remote);
  setAgentTourPreferences(userId, merged);

  const needsDbSync =
    (local.tour_completed && !remote.tour_completed) ||
    (local.tour_dismissed && !remote.tour_dismissed);

  if (needsDbSync) {
    void patchRemoteTourPrefs(merged);
  }

  return merged;
}

async function patchRemoteTourPrefs(prefs: AgentTourPreferences): Promise<void> {
  try {
    await fetch("/api/agent/product-tour", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tour_completed: prefs.tour_completed,
        tour_dismissed: prefs.tour_dismissed,
      }),
    });
  } catch (err) {
    console.warn("[agent-tour] Failed to persist prefs to server:", err);
  }
}

/** Persist immediately to localStorage, then sync to DB. */
export async function persistAgentTourPreferences(
  userId: string,
  patch: AgentTourPrefsPatch
): Promise<AgentTourPreferences> {
  const next = setAgentTourPreferences(userId, patch);
  await patchRemoteTourPrefs(next);
  return next;
}

export function getDefaultAgentTourPrefs(): AgentTourPreferences {
  return { ...DEFAULT_AGENT_TOUR_PREFS };
}
