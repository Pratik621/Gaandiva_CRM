# Gandiva — Architecture

Gandiva (gaandiva.com) is a **multi-tenant, role-based CRM / Lead Management System**. It runs
a calling/lead-generation operation: campaigns are created for clients, leads are uploaded and
assigned to agents, QA audits them, and MIS/Sales/Operations track performance — all isolated
per organization.

> **Status:** Live in production, 10k+ leads. Changes must be zero-downtime.
> This document is the architectural source of truth. The binding day-to-day rules live in
> [`.cursorrules`](./.cursorrules).

---

## 1. Technology stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14.2 (App Router, Route Handlers, Edge Middleware) |
| Language | TypeScript 5 (strict), React 18.3 |
| Backend-as-a-Service | Supabase — Postgres, Auth (GoTrue), Storage, RLS |
| Data access | `@supabase/ssr`, `@supabase/supabase-js` |
| UI | Ant Design 5 (primary) · shadcn/ui + Tailwind (new-york, lucide) · Recharts |
| Client state / data | TanStack React Query 5 |
| Files | `xlsx` (import/export), `jszip`, `@react-pdf/renderer` |
| Hosting | Vercel (Functions in **Mumbai `bom1`**, colocated with Supabase Mumbai `ap-south-1`) |

---

## 2. Domain model

**Tenancy:** `organizations` is the tenant root. Almost every table carries
`organization_id`. A user belongs to one organization (`users.organization_id`) and optionally
a `client_id`.

**Core entities**

- `users` — app profile (mirrors `auth.users` by `id`), with `status`, `reporting_manager_id`,
  `client_id`, `agent_code`, etc.
- `roles` + `user_roles` — many-to-many RBAC, org-scoped.
- `clients` — the customers campaigns are run for (company + contact + commercial fields).
- `campaigns` — a body of work for a client; carries `lead_type`, `campaign_type`,
  `assigned_team_leader_id`, allocation/QA/revenue metrics, `status`.
- `campaign_assignments` — which agents are assigned to a campaign (`is_active`).
- `leads` — the central, highest-volume table. ~80 columns: identity, company/enrichment,
  `status` (new → contacted → interested → followup → closed_won/lost), `qa_status`
  (qualified / disqualified / rectified), `lead_tagging`, delivery, voice/QA audit fields.
- `login_logs` — audit of sign-ins.
- Sales module: `sales_leads`, `deals`, `tasks`, `sales_tickets`, attachments, activities.
- Command center: campaign metrics, lead history, consent records, alerts.

**Lead lifecycle (typical):** MIS/TL uploads leads to a campaign → assigned to an agent →
agent dials and dispositions → QA audits (`qa_status`) → qualified/scored leads delivered to
client → tracked by MIS/Sales/Operations dashboards.

---

## 3. Roles & access

Roles are normalized to slugs (`normalizeRoleName`: lowercase, spaces → `_`).

| Role | Area | Scope |
|------|------|-------|
| `admin` | `/admin` (+ all areas) | Full org |
| `agent` | `/agent` | Only campaigns they're assigned to; own leads |
| `team_leader` / `tl` | `/tl` | Their campaigns/teams |
| `operations_manager` | `/tl` | Org-wide campaigns |
| `sales` / `sales_manager` | `/sales` | Org-wide sales/campaign data |
| `qa` | `/qa` | Org leads for auditing (scored scope) |
| `mis` | `/mis` | Org-wide reporting/exports |
| `dc` | `/dc` | Data/client-scoped views |
| `client_viewer` / `internal_operator` / `internal_admin` | `/dashboard` (command center) | Client- or org-scoped |

Route → allowed roles is declared in `src/lib/auth/config.ts` (`ROLE_ROUTE_ACCESS`,
`ROLE_DEFAULT_REDIRECT`).

---

## 4. Authentication & authorization flow

Authorization is **defense-in-depth** across three independent layers:

```
        ┌─────────────────────────────────────────────────────────────┐
        │ 1. Edge Middleware (src/middleware.ts)                       │
        │    - Reads session via @supabase/ssr cookies                │
        │    - Roles from JWT `app_roles` claim (custom access token   │
        │      hook) → DB fallback for pre-hook tokens                 │
        │    - Gates navigation via ROLE_ROUTE_ACCESS, redirects       │
        │    → UX / routing only (claim cached ~1h)                    │
        └─────────────────────────────────────────────────────────────┘
                                   │
        ┌─────────────────────────────────────────────────────────────┐
        │ 2. API Route Handlers (app/api/**)                          │
        │    - supabase.auth.getUser() → resolve org_id               │
        │    - Re-check role/authorization (authoritative, DB-backed)  │
        │    - Scope every query by organization_id                    │
        └─────────────────────────────────────────────────────────────┘
                                   │
        ┌─────────────────────────────────────────────────────────────┐
        │ 3. Row Level Security (Postgres)                            │
        │    - Final guarantee even if app code errs                   │
        │    - SECURITY DEFINER helpers, org + role predicates         │
        └─────────────────────────────────────────────────────────────┘
```

**Client auth state** is owned by `src/context/AuthContext.tsx`: it resolves the session
(`getUser` + `/api/profile` bootstrap), loads profile + roles, and exposes `hasRole`,
`hasTLAccess`, `getDefaultRedirect`, plus an `authVersion` counter that data hooks watch. It is
hardened for real-world flakiness: in-flight de-duplication, timeouts/fallbacks, cross-tab
sync (BroadcastChannel + storage events), visibility/online re-sync, and a clean sign-out that
purges storage and resets the client singleton.

**JWT custom claims:** a Postgres `custom_access_token_hook` injects an `app_roles` claim so
middleware can authorize without a DB round-trip on every navigation. The hook has an exception
guard (it never blocks token issuance), and middleware falls back to a DB role lookup when the
claim is absent — making it safe regardless of deploy/enable order.

---

## 5. Supabase client topology

Three clients, chosen by execution context and trust level:

- **Browser** — `lib/supabase/client.ts` (`createClient`, singleton; `resetClient` on
  sign-out). User session, subject to RLS.
- **Server** — `lib/supabase/server.ts` (`createClient`, cookie-bound). The default for route
  handlers and RSC; subject to RLS as the calling user.
- **Admin** — `lib/supabase/admin.ts` (`createAdminClient` / `getAdminClientSafe`). Uses the
  **service role and bypasses RLS** — server-only. Used for Storage browsing, cross-user
  aggregation, and privileged operations. Because RLS is bypassed, **org scoping must be
  enforced manually** in every admin-client query. `getAdminClientSafe()` returns `null` when
  the key is missing so callers can answer `503` instead of crashing.

**Middleware client** — `lib/supabase/middleware.ts` builds a request/response-bound client for
cookie refresh at the edge.

---

## 6. Data flow (read path)

```
React component
  └─ React Query hook (usePaginatedListQuery / useCachedApiQuery / domain hook)
       └─ fetch /api/<role>/<resource>?page&limit&q&filters
            └─ Route handler:  auth → org_id → role check
                 └─ lib/<domain> query (org-scoped, narrow columns, .range pagination)
                      └─ Supabase (server or admin client) → Postgres (+ RLS)
                 └─ enrichment (names, lazy/batched recordings) → shaped JSON
       └─ React Query cache (placeholderData keeps previous page during fetch)
  └─ AntD Table / Recharts render
```

Conventions: route handlers stay thin and delegate to `lib/<domain>`; list endpoints request
explicit columns (never `select("*")` on `leads`); secondary/expensive data (display names,
voice recordings) is loaded lazily or in batches, not inline.

---

## 7. Performance architecture

Performance is treated as a first-class constraint. The codebase encodes several hard-won
patterns:

1. **Region colocation** — Functions in Mumbai next to the DB eliminates ~200ms+ per query of
   cross-region latency (the dominant cost, since a request makes several sequential queries).
2. **Composite + trigram indexes** — `leads` is indexed on the real query shapes
   (`(organization_id, created_at DESC)`, `(campaign_id, created_at DESC)`,
   `(campaign_id, assigned_agent_id, created_at DESC)`, `(organization_id, qa_status)`) and
   `pg_trgm` GIN indexes for `ilike` search. Built with `CREATE INDEX CONCURRENTLY`.
3. **RLS InitPlan optimization** — auth helpers are wrapped as `(SELECT fn())` so they evaluate
   once per query rather than once per row (orders-of-magnitude difference at 10k+ rows).
4. **N+1 elimination** — e.g. voice recordings moved from a per-lead Storage listing inside the
   list response to a single batched endpoint (`/api/leads/voice-recordings`) with a coalesced
   client loader and bulk `createSignedUrls`.
5. **Round-trip consolidation** — hot paths collapse many sequential queries into one Postgres
   RPC (`get_my_profile_context` behind `/api/profile`), with a legacy fallback.
6. **JWT role claims** — removes a DB role lookup from every navigation in middleware.
7. **Pagination discipline** — PostgREST caps responses at **1000 rows**; exports/"fetch all"
   loop `.range()` until exhausted. `count: "exact"` is used sparingly.
8. **Client caching & code-splitting** — React Query with `placeholderData`, memoized context,
   and dynamic `import()` for heavy libs (`xlsx`, `jszip`, `@react-pdf/renderer`).

Every one of these was applied zero-downtime (DB-side changes paired with code fallbacks).

---

## 8. UI architecture

- **Component systems:** Ant Design 5 drives dashboards, tables, and forms; shadcn/ui +
  Tailwind (new-york style, lucide icons, `components/ui`) provides custom primitives. Charts
  use Recharts inside `ResponsiveContainer`.
- **Layout:** per-role route groups under `app/<role>/` with shared dashboard chrome
  (greeting, cards). Consistent card styling (rounded, soft shadow, light border).
- **Tables:** server-driven pagination (`useServerTablePagination` + `usePaginatedListQuery`),
  debounced search, column definitions factored into `components/Leads/LeadTableColumns`.
- **State discipline:** mandatory loading / empty / error states; graceful per-row degradation;
  errors surfaced via AntD `message`. Production views render **real org-scoped data only** —
  no placeholder/demo arrays.

---

## 9. Directory map

```
src/
  app/
    <role>/                 admin · agent · tl · sales · qa · mis · dc · dashboard
    api/<role>/             route handlers mirrored by role
    providers.tsx           React Query + AntD registry
  components/
    <Domain>/               Leads, Sales, TL, QA, MIS, DC, Campaigns, Chat, command, ...
    ui/                     shadcn/ui primitives
  context/AuthContext.tsx   auth/session/roles provider
  hooks/                    useAuthReady, usePaginatedListQuery, useServerTablePagination, ...
  lib/
    supabase/               client · server · admin · middleware
    auth/                   config (route access) · tl-access · server-roles
    <domain>/               mis · tl · command · sales · campaign · lho · chat ...
    api-pagination.ts, cache.ts, lead-display-names.ts, voice-recordings*.ts ...
  types/                    database.types.ts (source of truth) + domain types
  middleware.ts             edge auth + role-gated routing
supabase/migrations/        SQL migrations (production schema has drifted — verify live state)
```

Path alias `@/*` → `src/*`.

---

## 10. Operational notes & conventions

- **Schema drift:** the live database has diverged from `supabase/migrations` (extra policies,
  columns). Treat `src/types/database.types.ts` and the live DB (`pg_policies`, `\d`) as
  truth, not migration files alone. Some list queries already defend against missing columns
  with a narrower-select retry.
- **DB changes:** idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`), zero-downtime, and paired
  with a code fallback. Indexes via `CONCURRENTLY`. State the apply order.
- **Route handlers:** `export const dynamic = "force-dynamic"`, try/catch with a tagged
  `console.error`, typed JSON errors with correct status codes (401/403/400/404/503/500).
- **Verification gate:** `npx tsc --noEmit` and `npm run build` must pass before shipping.
- **Secrets:** only `NEXT_PUBLIC_*` reach the browser; service role stays server-side; never
  log secrets or full PII.

---

## 11. Known follow-ups / roadmap

- Migrate to asymmetric JWT signing keys so middleware verifies claims fully locally (removes
  the last auth network hop on navigation).
- Standardize remaining list pages onto React Query; replace ad-hoc `useEffect + fetch`.
- Clean up: `middleware.ts` dead variable, `dc/campagins` typo route trees, search underscore
  escaping, memoize the `AuthContext` value, audit `xlsx` version/CVE and static imports.
