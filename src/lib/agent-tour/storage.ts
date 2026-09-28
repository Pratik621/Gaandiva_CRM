export type AgentTourPreferences = {
  tour_completed: boolean;
  tour_dismissed: boolean;
};

const KEY_PREFIX = "gandiv:agent_product_tour:";

export const DEFAULT_AGENT_TOUR_PREFS: AgentTourPreferences = {
  tour_completed: false,
  tour_dismissed: false,
};

function parseStoredPrefs(raw: string): AgentTourPreferences {
  const parsed = JSON.parse(raw) as Partial<
    AgentTourPreferences & { dont_show_again?: boolean }
  >;
  return {
    tour_completed: Boolean(parsed.tour_completed),
    tour_dismissed: Boolean(parsed.tour_dismissed ?? parsed.dont_show_again),
  };
}

export function getAgentTourPreferences(userId: string): AgentTourPreferences {
  if (typeof window === "undefined" || !userId) return { ...DEFAULT_AGENT_TOUR_PREFS };
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${userId}`);
    if (!raw) return { ...DEFAULT_AGENT_TOUR_PREFS };
    return parseStoredPrefs(raw);
  } catch {
    return { ...DEFAULT_AGENT_TOUR_PREFS };
  }
}

export function setAgentTourPreferences(
  userId: string,
  patch: Partial<AgentTourPreferences>
): AgentTourPreferences {
  const current = getAgentTourPreferences(userId);
  const next = { ...current, ...patch };
  if (typeof window !== "undefined" && userId) {
    localStorage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify(next));
  }
  return next;
}
