/** Broadcast channel so /tl/team and /tl/team-performance stay in sync after DnD assigns. */
export const TEAM_ASSIGNMENT_CHANNEL = "team-assignment-updated";

export function broadcastTeamAssignmentUpdated() {
  if (typeof window === "undefined") return;
  try {
    new BroadcastChannel(TEAM_ASSIGNMENT_CHANNEL).postMessage({ ts: Date.now() });
  } catch {
    // BroadcastChannel not available in all environments
  }
}
