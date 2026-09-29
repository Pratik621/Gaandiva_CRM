/**
 * Dialer CDR (call detail records) import / export for agents.
 * Rows are stored in the Call Logs DB table public.cdr_records.
 */

/** File header (exact dialer export order) -> cdr_records column. */
export const CDR_COLUMNS = [
  { header: "calldate", key: "calldate" },
  { header: "calldate_US_Eastern", key: "calldate_us_eastern" },
  { header: "clid", key: "clid" },
  { header: "src", key: "src" },
  { header: "dst", key: "dst" },
  { header: "dcontext", key: "dcontext" },
  { header: "channel", key: "channel" },
  { header: "dstchannel", key: "dstchannel" },
  { header: "lastapp", key: "lastapp" },
  { header: "lastdata", key: "lastdata" },
  { header: "duration", key: "duration" },
  { header: "billsec", key: "billsec" },
  { header: "disposition", key: "disposition" },
  { header: "amaflags", key: "amaflags" },
  { header: "accountcode", key: "accountcode" },
  { header: "uniqueid", key: "uniqueid" },
  { header: "userfield", key: "userfield" },
  { header: "did", key: "did" },
  { header: "cnum", key: "cnum" },
  { header: "cnam", key: "cnam" },
  { header: "outbound_cnum", key: "outbound_cnum" },
  { header: "outbound_cnam", key: "outbound_cnam" },
  { header: "dst_cnam", key: "dst_cnam" },
  { header: "recordingfile", key: "recordingfile" },
  { header: "linkedid", key: "linkedid" },
  { header: "peeraccount", key: "peeraccount" },
  { header: "sequence", key: "sequence" },
] as const;

export type CdrKey = (typeof CDR_COLUMNS)[number]["key"];
export type CdrRow = Partial<Record<CdrKey, string | number | null>>;

export const CDR_IMPORT_BATCH_SIZE = 500;
export const CDR_EXPORT_PAGE_SIZE = 1000;

const DATE_KEYS = new Set<CdrKey>(["calldate", "calldate_us_eastern"]);
const INT_KEYS = new Set<CdrKey>(["duration", "billsec"]);

const pad = (n: number) => String(n).padStart(2, "0");

/** Excel serial date (days since 1899-12-30) or date-like string -> "YYYY-MM-DD HH:mm:ss". */
export function normalizeCdrDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000); // serial -> unix ms (wall clock, UTC)
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }
  const s = String(value).trim();
  // 2026-09-15 14:24:17 / 2026-09-15T14:24:17 / 2026/09/15 14:24
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (iso) {
    const [, y, m, d, hh = "0", mi = "0", ss = "0"] = iso;
    return `${y}-${pad(+m)}-${pad(+d)} ${pad(+hh)}:${mi}:${pad(+ss)}`;
  }
  // 09/15/2026 14:24:17 (US month/day)
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (us) {
    const [, m, d, y, hh = "0", mi = "0", ss = "0"] = us;
    return `${y}-${pad(+m)}-${pad(+d)} ${pad(+hh)}:${mi}:${pad(+ss)}`;
  }
  return null;
}

function normalizeInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? Math.round(n) : null;
}

function normalizeText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s.slice(0, 2000);
}

/** One raw file / request row -> clean cdr_records values (unknown keys dropped). */
export function normalizeCdrRow(raw: Record<string, unknown>): CdrRow {
  const out: CdrRow = {};
  for (const { key } of CDR_COLUMNS) {
    const v = raw[key];
    if (DATE_KEYS.has(key)) out[key] = normalizeCdrDate(v);
    else if (INT_KEYS.has(key)) out[key] = normalizeInt(v);
    else out[key] = normalizeText(v);
  }
  // Dedupe key (agent_id, uniqueid, sequence): NULL sequence would never conflict.
  if (out.uniqueid != null && out.sequence == null) out.sequence = "";
  return out;
}

/** True when a row has nothing worth storing. */
export function isEmptyCdrRow(row: CdrRow): boolean {
  return CDR_COLUMNS.every(({ key }) => row[key] == null || row[key] === "");
}

/**
 * Map a parsed sheet row (keyed by the file's header) to CDR keys. Header match is
 * case-insensitive and ignores spaces, so "Calldate US Eastern" also works.
 */
export function mapCdrHeaderRow(row: Record<string, unknown>): Record<string, unknown> {
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
  const byHeader = new Map<string, CdrKey>(CDR_COLUMNS.map((c) => [norm(c.header), c.key]));
  const out: Record<string, unknown> = {};
  for (const [h, v] of Object.entries(row)) {
    const key = byHeader.get(norm(h));
    if (key) out[key] = v;
  }
  return out;
}
