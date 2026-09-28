/** Role area for the announcements inbox (admin > sales > tl > qa > mis > mis_tl > qa_tl > agent). */
export function resolveAnnouncementsPath(hasRoleFn: (role: string) => boolean): string {
  if (hasRoleFn("admin")) return "/admin/announcements";
  if (hasRoleFn("sales_manager") || hasRoleFn("sales")) return "/sales/announcements";
  if (hasRoleFn("operations_manager") || hasRoleFn("team_leader") || hasRoleFn("tl"))
    return "/tl/announcements";
  if (hasRoleFn("qa")) return "/qa/announcements";
  if (hasRoleFn("mis")) return "/mis/announcements";
  if (hasRoleFn("mis_tl")) return "/mistl/announcements";
  if (hasRoleFn("qa_tl")) return "/qatl/announcements";
  return "/agent/announcements";
}
