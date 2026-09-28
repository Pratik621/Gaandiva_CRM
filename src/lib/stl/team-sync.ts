/** Broadcast channel so /stl/team and /stl/team-performance stay in sync after DnD assigns. */
export const STL_TEAM_ASSIGNMENT_CHANNEL = "stl-team-assignment-updated";

export function broadcastSTLTeamAssignmentUpdated() {
  if (typeof window === "undefined") return;
  try {
    new BroadcastChannel(STL_TEAM_ASSIGNMENT_CHANNEL).postMessage({ ts: Date.now() });
  } catch {
    // BroadcastChannel not available in all environments
  }
}
