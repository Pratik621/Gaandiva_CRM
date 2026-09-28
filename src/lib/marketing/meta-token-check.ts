import {
  graphGet,
  graphGetAll,
  discoverMetaPages,
  resolveStoredMetaPage,
  MetaGraphError,
  INVALID_TOKEN_CODE,
} from "./meta-graph";

// Permissions the Lead Ads pull needs on top of a valid token.
export const LEAD_READ_PERMISSIONS = [
  "leads_retrieval",
  "pages_manage_ads",
  "pages_show_list",
  "pages_read_engagement",
];

export interface MetaTokenCheck {
  /** false only when Meta rejected the token itself (bad signature, expired, …). */
  tokenValid: boolean;
  error: string | null;
  /** null when Meta doesn't expose permissions for this token type (e.g. Page tokens). */
  permissions: string[] | null;
  missingLeadPermissions: string[];
  canReadLeads: boolean;
  leadsError: string | null;
  page: { id: string; name: string | null } | null;
  /** Every Facebook Page Meta says this token can reach (/me/accounts + Business owned_pages). */
  discoveredPages: { id: string; name: string | null }[];
  /** The requested/stored Page ID when it wasn't a reachable Page and the discovered one was used. */
  pageCorrectedFrom: string | null;
  forms: { id: string; name: string | null }[];
  /** Whether any form returned a real lead in a 1-lead probe (null when there are no forms). */
  sampleLeadFound: boolean | null;
  /** The first form that returned a lead. */
  sampleLeadForm: { id: string; name: string | null } | null;
  dataset: { id: string; ok: boolean; name: string | null; error: string | null } | null;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown Meta error";
}

function isInvalidToken(err: unknown): boolean {
  return err instanceof MetaGraphError && err.code === INVALID_TOKEN_CODE;
}

/**
 * Asks Meta what this token can actually do, without storing anything:
 * which permissions it holds, whether it reaches a Page and can read that
 * Page's lead forms + leads (the pull), and whether it can reach the
 * Conversions API dataset (the push). Used on connect and by the "Check"
 * button so problems show up as plain answers, not a failed sync later.
 */
export async function checkMetaToken(
  accessToken: string,
  pageId: string | null,
  datasetId: string | null
): Promise<MetaTokenCheck> {
  const result: MetaTokenCheck = {
    tokenValid: true,
    error: null,
    permissions: null,
    missingLeadPermissions: [],
    canReadLeads: false,
    leadsError: null,
    page: null,
    discoveredPages: [],
    pageCorrectedFrom: null,
    forms: [],
    sampleLeadFound: null,
    sampleLeadForm: null,
    dataset: null,
  };
  const invalidTokenErrors: string[] = [];

  try {
    const granted = await graphGetAll<{ permission: string; status: string }>("me/permissions", accessToken);
    result.permissions = granted.filter((p) => p.status === "granted").map((p) => p.permission);
    result.missingLeadPermissions = LEAD_READ_PERMISSIONS.filter((p) => !result.permissions!.includes(p));
  } catch (err) {
    if (isInvalidToken(err)) invalidTokenErrors.push(messageOf(err));
  }

  try {
    result.discoveredPages = (await discoverMetaPages(accessToken)).map((p) => ({ id: p.id, name: p.name }));
    const page = await resolveStoredMetaPage(accessToken, pageId);
    result.page = { id: page.pageId, name: page.pageName };
    result.pageCorrectedFrom = page.correctedFrom;
    const forms = await graphGetAll<{ id: string; name?: string }>(`${page.pageId}/leadgen_forms`, page.pageToken, {
      fields: "id,name",
      limit: "100",
    });
    result.forms = forms.map((f) => ({ id: f.id, name: f.name ?? null }));
    // Probe forms one lead at a time until one actually returns a lead — proves
    // real lead data is readable, not just the form list.
    // A single failing form doesn't mean leads are unreadable — only when
    // every form fails is that reported.
    if (forms.length > 0) {
      result.sampleLeadFound = false;
      let firstProbeError: unknown = null;
      let probesFailed = 0;
      for (const form of forms) {
        try {
          const probe = await graphGet<{ data: unknown[] }>(`${form.id}/leads`, page.pageToken, {
            fields: "id",
            limit: "1",
          });
          if (probe.data.length > 0) {
            result.sampleLeadFound = true;
            result.sampleLeadForm = { id: form.id, name: form.name ?? null };
            break;
          }
        } catch (err) {
          probesFailed += 1;
          firstProbeError ??= err;
        }
      }
      if (probesFailed === forms.length) throw firstProbeError;
    }
    result.canReadLeads = true;
  } catch (err) {
    if (isInvalidToken(err)) invalidTokenErrors.push(messageOf(err));
    result.leadsError = messageOf(err);
  }

  if (datasetId) {
    try {
      const dataset = await graphGet<{ id: string; name?: string }>(datasetId, accessToken, { fields: "id,name" });
      result.dataset = { id: datasetId, ok: true, name: dataset.name ?? null, error: null };
    } catch (err) {
      if (isInvalidToken(err)) invalidTokenErrors.push(messageOf(err));
      result.dataset = { id: datasetId, ok: false, name: null, error: messageOf(err) };
    }
  }

  // Only call the token itself invalid when Meta said so (code 190) and
  // nothing succeeded — a permissions error on one edge isn't a bad token.
  const anythingWorked = result.permissions !== null || result.canReadLeads || !!result.dataset?.ok;
  if (invalidTokenErrors.length > 0 && !anythingWorked) {
    result.tokenValid = false;
    result.error = invalidTokenErrors[0];
  }

  return result;
}
