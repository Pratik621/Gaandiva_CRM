/**
 * Check Data — lead specification simulator.
 * Client-side demo logic; swap `analyzeLeadSpecs` for a real API call later.
 */

import { ALL_COUNTRIES } from "./check-data-geo";
import {
  generateLocalizedPerson,
  getCountryLocale,
  hashCountrySalt,
  pickVariedFromLocale,
  PREVIEW_ROW_COUNT,
} from "./check-data-locale";
import {
  B2B_SPEC_CATALOG,
  getB2BSpecDefinition,
  type B2BSpecEntry,
  type B2BSpecFieldKey,
} from "./check-data-b2b-specs";

export type SpecFieldType =
  | "country"
  | "state"
  | "city"
  | "industry"
  | "job_title"
  | "company_size"
  | "revenue_range"
  | "funding_stage"
  | "technology"
  | "decision_maker"
  | "department";

export interface LeadSpecs {
  country: string[];
  state: string[];
  city: string[];
  industry: string[];
  job_title: string[];
  company_size: string[];
  revenue_range: string[];
  funding_stage: string[];
  technology: string[];
  decision_maker: string[];
  department: string[];
  b2b_specs: B2BSpecEntry[];
}

export interface SpecFilter {
  field: SpecFieldType | B2BSpecFieldKey;
  values: string[];
  isB2B?: boolean;
}

export interface PreviewRecord {
  id: string;
  name: string;
  company: string;
  jobTitle: string;
  industry: string;
  country: string;
  email: string;
  phone: string;
}

export interface CheckDataResults {
  matchingLeads: number;
  coveragePercent: number;
  availableCompanies: number;
  availableContacts: number;
  previewRecords: PreviewRecord[];
}

export interface SpecFieldDefinition {
  type: SpecFieldType;
  label: string;
  placeholder: string;
  options?: string[];
  section: "geography" | "company" | "contact";
}

export const EMPTY_LEAD_SPECS: LeadSpecs = {
  country: [],
  state: [],
  city: [],
  industry: [],
  job_title: [],
  company_size: [],
  revenue_range: [],
  funding_stage: [],
  technology: [],
  decision_maker: [],
  department: [],
  b2b_specs: [],
};

export const SPEC_FIELD_DEFINITIONS: SpecFieldDefinition[] = [
  {
    type: "country",
    label: "Country",
    placeholder: "Select countries",
    options: ALL_COUNTRIES,
    section: "geography",
  },
  {
    type: "state",
    label: "State / Region",
    placeholder: "Select states",
    section: "geography",
  },
  {
    type: "city",
    label: "City",
    placeholder: "Select cities",
    section: "geography",
  },
  {
    type: "industry",
    label: "Industry",
    placeholder: "Select industries",
    options: [
      "SaaS",
      "FinTech",
      "Healthcare",
      "Manufacturing",
      "Retail",
      "E-commerce",
      "Cybersecurity",
      "EdTech",
      "Logistics",
      "Real Estate",
      "Insurance",
      "Legal Services",
      "Media & Entertainment",
      "Telecommunications",
      "Energy",
      "Automotive",
      "Aerospace",
      "Biotechnology",
      "Hospitality",
      "Construction",
    ],
    section: "company",
  },
  {
    type: "company_size",
    label: "Employee Count",
    placeholder: "Select employee count ranges",
    options: ["1-10", "11-50", "50-200", "201-500", "501-1000", "1001-5000", "5000+"],
    section: "company",
  },
  {
    type: "revenue_range",
    label: "Revenue Range",
    placeholder: "Select revenue ranges",
    options: [
      "$0 - $1M",
      "$1M - $10M",
      "$10M - $50M",
      "$50M - $100M",
      "$100M - $500M",
      "$500M+",
    ],
    section: "company",
  },
  {
    type: "funding_stage",
    label: "Funding Stage",
    placeholder: "Select funding stages",
    options: [
      "Bootstrapped",
      "Pre-Seed",
      "Seed",
      "Series A",
      "Series B",
      "Series C+",
      "Growth Equity",
      "Private Equity Backed",
      "Public / IPO",
    ],
    section: "company",
  },
  {
    type: "job_title",
    label: "Job Title",
    placeholder: "Select job titles",
    options: [
      "CEO",
      "CTO",
      "CFO",
      "COO",
      "CMO",
      "VP Sales",
      "VP Marketing",
      "VP Engineering",
      "Director of IT",
      "Head of Operations",
      "Founder",
      "Managing Director",
      "Chief Revenue Officer",
      "Sales Manager",
      "Product Manager",
    ],
    section: "contact",
  },
  {
    type: "decision_maker",
    label: "Decision Maker Level",
    placeholder: "Select decision maker levels",
    options: ["C-Suite", "VP / Director", "Manager", "Individual Contributor"],
    section: "contact",
  },
  {
    type: "department",
    label: "Department",
    placeholder: "Select departments",
    options: [
      "Sales",
      "Marketing",
      "Engineering",
      "IT / Technology",
      "Finance",
      "Human Resources",
      "Operations",
      "Product",
      "Legal",
      "Customer Success",
      "Procurement",
      "Business Development",
    ],
    section: "contact",
  },
  {
    type: "technology",
    label: "Technology Used",
    placeholder: "Select technologies",
    options: [
      "Salesforce",
      "HubSpot",
      "AWS",
      "Microsoft Azure",
      "Google Cloud",
      "SAP",
      "Oracle",
      "Snowflake",
      "Slack",
      "Zoom",
      "Microsoft 365",
      "Google Workspace",
      "Zendesk",
      "Marketo",
      "Shopify",
      "Workday",
      "ServiceNow",
      "Tableau",
    ],
    section: "contact",
  },
];

const COMPANY_TO_AUDIENCE_RATIO = 0.18;
const CONTACT_TO_AUDIENCE_RATIO = 1.35;

const VALUE_REDUCTION_FACTORS: Record<string, number> = {
  "country:United States": 0.141,
  "country:USA": 0.141,
  "country:United Kingdom": 0.048,
  "country:Canada": 0.032,
  "country:Germany": 0.041,
  "country:France": 0.036,
  "country:Australia": 0.028,
  "country:India": 0.095,
  "country:Singapore": 0.012,
  "country:United Arab Emirates": 0.018,
  "country:Japan": 0.052,
  "country:China": 0.118,
  "country:Brazil": 0.067,
  "industry:SaaS": 0.292,
  "industry:FinTech": 0.215,
  "industry:Healthcare": 0.178,
  "industry:Manufacturing": 0.245,
  "industry:Cybersecurity": 0.162,
  "job_title:CEO": 0.149,
  "job_title:CTO": 0.198,
  "job_title:CFO": 0.176,
  "job_title:VP Sales": 0.224,
  "job_title:Founder": 0.131,
  "company_size:50-200": 0.279,
  "company_size:11-50": 0.412,
  "company_size:201-500": 0.318,
  "revenue_range:$10M - $50M": 0.352,
  "revenue_range:$50M - $100M": 0.268,
  "technology:Salesforce": 0.385,
  "technology:HubSpot": 0.421,
  "technology:AWS": 0.356,
  "decision_maker:C-Suite": 0.168,
  "decision_maker:VP / Director": 0.312,
  "funding_stage:Series A": 0.318,
  "funding_stage:Series B": 0.276,
  "funding_stage:Seed": 0.392,
  "funding_stage:Bootstrapped": 0.448,
  "funding_stage:Public / IPO": 0.198,
  "department:Sales": 0.284,
  "department:Marketing": 0.312,
  "department:Engineering": 0.268,
  "department:IT / Technology": 0.295,
  "state:California": 0.382,
  "state:New York": 0.341,
  "state:Texas": 0.298,
};

const FIELD_DEFAULT_FACTORS: Record<SpecFieldType, number> = {
  country: 0.22,
  state: 0.48,
  city: 0.62,
  industry: 0.38,
  job_title: 0.24,
  company_size: 0.52,
  revenue_range: 0.55,
  funding_stage: 0.46,
  technology: 0.44,
  decision_maker: 0.32,
  department: 0.36,
};

const B2B_VALUE_OVERRIDES: Record<string, number> = {
  "clinical_specialty:Dermatology": 0.14,
  "clinical_specialty:Cardiology": 0.16,
  "target_seniority:Practice Owner": 0.12,
  "healthcare_payers:National Health Plans": 0.11,
  "pharma_biotech:Clinical Development": 0.15,
  "buying_intent:EHR Migration / Replacement": 0.13,
  "account_tier:Tier 1 — Strategic": 0.1,
  "healthcare_it_stack:Epic": 0.18,
  "therapeutic_area:Oncology": 0.14,
  "clinical_trial_phase:Phase III": 0.12,
};

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function getReductionFactor(field: SpecFieldType | B2BSpecFieldKey, value: string, isB2B = false): number {
  const key = `${field}:${value.trim()}`;
  if (VALUE_REDUCTION_FACTORS[key] != null) {
    return VALUE_REDUCTION_FACTORS[key];
  }
  if (B2B_VALUE_OVERRIDES[key] != null) {
    return B2B_VALUE_OVERRIDES[key];
  }
  const hash = hashString(key);
  if (isB2B) {
    const def = getB2BSpecDefinition(field as B2BSpecFieldKey);
    const variance = 0.78 + (hash % 22) / 100;
    return Math.min(0.88, def.narrowFactor * variance);
  }
  const base = FIELD_DEFAULT_FACTORS[field as SpecFieldType];
  const variance = 0.72 + (hash % 28) / 100;
  return Math.min(0.92, base * variance);
}

/** OR semantics within a field — multiple selections broaden the pool. */
function combinedFieldFactor(filter: SpecFilter): number {
  const trimmed = filter.values.map((v) => v.trim()).filter(Boolean);
  if (!trimmed.length) return 1;
  return 1 - trimmed.reduce(
    (acc, v) => acc * (1 - getReductionFactor(filter.field, v, filter.isB2B)),
    1
  );
}

export function specsToFilters(specs: LeadSpecs): SpecFilter[] {
  const standard = (Object.keys(specs) as Array<keyof LeadSpecs>)
    .filter((key): key is SpecFieldType => key !== "b2b_specs")
    .map((field) => ({ field, values: specs[field] }))
    .filter((f) => f.values.length > 0);

  const b2b = specs.b2b_specs
    .filter((entry) => entry.values.length > 0)
    .map((entry) => ({
      field: entry.fieldKey,
      values: entry.values,
      isB2B: true,
    }));

  return [...standard, ...b2b];
}

export function getActiveFilterCount(specs: LeadSpecs): number {
  return specsToFilters(specs).length;
}

/** More spec fields / values → longer simulated analysis time. */
export function computeAnalysisDelayMs(specs: LeadSpecs): number {
  const fields = specsToFilters(specs);
  const fieldCount = fields.length;
  const valueCount = fields.reduce((sum, f) => sum + f.values.length, 0);

  const BASE_MS = 750;
  const PER_FIELD_MS = 380;
  const PER_VALUE_MS = 130;
  const MIN_MS = 950;
  const MAX_MS = 5200;

  return Math.min(
    MAX_MS,
    Math.max(MIN_MS, BASE_MS + fieldCount * PER_FIELD_MS + valueCount * PER_VALUE_MS)
  );
}

export function getAnalysisLoadingMessage(specs: LeadSpecs): string {
  const fieldCount = getActiveFilterCount(specs);
  const valueCount = getActiveFilterChips(specs).length;

  if (fieldCount === 0) {
    return "Scanning global lead database...";
  }
  if (valueCount === fieldCount) {
    return `Matching leads against ${fieldCount} specification${fieldCount > 1 ? "s" : ""}...`;
  }
  return `Applying ${fieldCount} spec fields (${valueCount} filters)...`;
}

export function getActiveFilterChips(
  specs: LeadSpecs
): Array<{
  kind: "standard" | "b2b";
  field: SpecFieldType | B2BSpecFieldKey;
  label: string;
  value: string;
  b2bEntryId?: string;
}> {
  const chips: Array<{
    kind: "standard" | "b2b";
    field: SpecFieldType | B2BSpecFieldKey;
    label: string;
    value: string;
    b2bEntryId?: string;
  }> = [];

  for (const def of SPEC_FIELD_DEFINITIONS) {
    for (const value of specs[def.type]) {
      chips.push({ kind: "standard", field: def.type, label: def.label, value });
    }
  }

  for (const entry of specs.b2b_specs) {
    const def = getB2BSpecDefinition(entry.fieldKey);
    for (const value of entry.values) {
      chips.push({
        kind: "b2b",
        field: entry.fieldKey,
        label: def.label,
        value,
        b2bEntryId: entry.id,
      });
    }
  }

  return chips;
}

export function getFieldDefinition(type: SpecFieldType): SpecFieldDefinition {
  return SPEC_FIELD_DEFINITIONS.find((d) => d.type === type) ?? SPEC_FIELD_DEFINITIONS[0];
}

export function estimateLeadVolume(specs: LeadSpecs): Omit<CheckDataResults, "previewRecords"> {
  const audienceStats = computeGlobalAudienceStats(specs);
  const active = specsToFilters(specs);
  const globalTotal = GLOBAL_AUDIENCE_TOTAL_MILLIONS * 1_000_000;

  const audienceForLeads = active.length
    ? resolveFilteredLeadAudience(specs, audienceStats)
    : globalTotal;

  const matchingLeads = Math.max(42, Math.round(audienceForLeads));
  const coveragePercent = Math.min(
    100,
    Math.round((audienceForLeads / globalTotal) * 1000) / 10
  );
  const companyRatio = COMPANY_TO_AUDIENCE_RATIO + active.length * 0.004;
  const contactRatio = CONTACT_TO_AUDIENCE_RATIO + active.length * 0.015;

  return {
    matchingLeads,
    coveragePercent,
    availableCompanies: Math.max(12, Math.round(matchingLeads * companyRatio)),
    availableContacts: Math.max(18, Math.round(matchingLeads * contactRatio)),
  };
}

const FALLBACK_COUNTRIES = ["United States", "United Kingdom", "Canada", "Germany", "India", "Australia"];

function pickFrom(values: string[], fallback: string[], seed: number): string {
  if (values.length) return values[seed % values.length];
  return fallback[seed % fallback.length];
}

function collectB2BValues(specs: LeadSpecs, key: B2BSpecFieldKey): string[] {
  return specs.b2b_specs
    .filter((e) => e.fieldKey === key && e.values.length > 0)
    .flatMap((e) => e.values);
}

function generatePreviewRecords(specs: LeadSpecs, count = PREVIEW_ROW_COUNT): PreviewRecord[] {
  const active = specsToFilters(specs);
  const seedBase = hashString(
    active.map((f) => `${f.field}=${f.values.join(",")}`).join("|") || "all"
  );
  const countryPool = specs.country.length ? specs.country : FALLBACK_COUNTRIES;
  const usedNames = new Set<string>();
  const records: PreviewRecord[] = [];

  const seniorityTitles = collectB2BValues(specs, "target_seniority");
  const jobFunctions = collectB2BValues(specs, "job_function");
  const clinicalSpecs = collectB2BValues(specs, "clinical_specialty");

  for (let i = 0; i < count; i++) {
    const country = countryPool[mixIndex(countryPool.length, i, seedBase, 13)];
    const locale = getCountryLocale(country);
    const countrySalt = hashCountrySalt(country, seedBase);
    const person = generateLocalizedPerson(locale, i, countrySalt, usedNames);
    const company = pickVariedFromLocale(locale.companies, i, countrySalt ^ 0x4f1bbcdc, 23);

    const industryPool = specs.industry.length
      ? specs.industry
      : clinicalSpecs.length
        ? clinicalSpecs
        : [];
    const industry = pickFrom(
      industryPool,
      ["SaaS", "FinTech", "Healthcare", "Manufacturing", "Cybersecurity"],
      i + seedBase
    );
    const jobTitle = pickFrom(
      specs.job_title.length
        ? specs.job_title
        : seniorityTitles.length
          ? seniorityTitles
          : jobFunctions.length
            ? jobFunctions
            : [],
      ["CEO", "CTO", "VP Sales", "Director", "Founder", "Head of Operations"],
      i + seedBase + 7
    );

    const emailLocal = `${person.first.toLowerCase().replace(/[^a-z]/g, "")}.${person.last.toLowerCase().replace(/[^a-z]/g, "")}${(i % 90) + 10}`;
    const domain = locale.emailDomain(company, countrySalt + i);
    const phoneSeed = countrySalt ^ Math.imul(i + 1, 0x7feb352d);

    records.push({
      id: `preview-${seedBase}-${i}`,
      name: person.fullName,
      company,
      jobTitle,
      industry,
      country,
      email: `${emailLocal}@${domain}`,
      phone: locale.phoneFormat(phoneSeed),
    });
  }

  return records;
}

function mixIndex(length: number, row: number, salt: number, prime: number): number {
  if (length <= 0) return 0;
  const mixed = Math.imul(row + 1, prime) ^ salt ^ Math.imul(row, 0x9e3779b1);
  return Math.abs(mixed) % length;
}

export interface GlobalAudienceSegment {
  key: string;
  label: string;
  /** Global pool size in millions (unfiltered view). */
  millions: number;
  /** Maps to standard department filter options when narrowing by department. */
  departments?: string[];
}

export const GLOBAL_AUDIENCE_SEGMENTS: GlobalAudienceSegment[] = [
  { key: "marketing", label: "Marketing", millions: 28.73, departments: ["Marketing"] },
  { key: "sales", label: "Sales", millions: 29.41, departments: ["Sales", "Business Development"] },
  { key: "hr", label: "Human Resources", millions: 19.21, departments: ["Human Resources"] },
  {
    key: "it",
    label: "Information Technology",
    millions: 49.84,
    departments: ["IT / Technology", "Engineering", "Product"],
  },
  { key: "finance", label: "Finance", millions: 13.26, departments: ["Finance"] },
  { key: "business_leaders", label: "Business Leaders", millions: 3.06 },
  { key: "supply_chain", label: "Supply Chain", millions: 2.28, departments: ["Operations", "Procurement"] },
  { key: "lnd", label: "Learning & Development", millions: 1.19 },
  { key: "cx", label: "Customer Experience", millions: 0.95, departments: ["Customer Success"] },
  { key: "others", label: "Others", millions: 15.31 },
];

export const GLOBAL_AUDIENCE_TOTAL_MILLIONS = GLOBAL_AUDIENCE_SEGMENTS.reduce(
  (sum, s) => sum + s.millions,
  0
);

export interface GlobalAudienceStat {
  key: string;
  label: string;
  count: number;
  formatted: string;
  /** True when a department filter targets this audience segment. */
  highlighted?: boolean;
}

/** Unfiltered global pool — value in millions with suffix after the number, e.g. "28.73 M". */
export function formatAudienceMillions(millions: number): string {
  return `${millions.toFixed(2)} M`;
}

/** Filtered pool — value in lakhs with suffix after the number, e.g. "1.7 Lac". */
export function formatAudienceLac(count: number): string {
  const lac = count / 100_000;
  if (lac >= 100) return `${(lac / 100).toFixed(2)} Cr`;
  if (lac >= 10) return `${lac.toFixed(1)} Lac`;
  if (lac >= 1) return `${lac.toFixed(1)} Lac`;
  return `${lac.toFixed(2)} Lac`;
}

/** Summary + audience counts — M when unfiltered, Lac when filters are active. */
export function formatSummaryCount(count: number, hasFilters: boolean): string {
  return hasFilters ? formatAudienceLac(count) : formatAudienceMillions(count / 1_000_000);
}

/** Unmatched audience segments after a department filter — kept low so the selected function dominates. */
const DEPARTMENT_NON_MATCH_BLEED = 0.012;

function getNonDepartmentFilterMultiplier(filters: SpecFilter[]): number {
  return filters
    .filter((f) => f.field !== "department")
    .reduce((acc, f) => acc * combinedFieldFactor(f), 1);
}

/**
 * When a department is selected (e.g. Marketing), the matching audience segment retains
 * a large share; all other segments shrink to a small bleed so the chosen function reads higher.
 */
function getDepartmentSegmentMultiplier(
  segment: GlobalAudienceSegment,
  departmentValues: string[]
): number {
  if (!departmentValues.length) return 1;

  if (segment.departments?.length) {
    const matching = departmentValues.filter((v) => segment.departments!.includes(v));
    if (matching.length) {
      const narrow = combinedFieldFactor({ field: "department", values: matching });
      // 48–82% retained for the matched function (Marketing stays visibly ahead of others).
      return 0.48 + narrow * 0.34;
    }
    return DEPARTMENT_NON_MATCH_BLEED;
  }

  if (segment.key === "others") {
    return DEPARTMENT_NON_MATCH_BLEED * 2.2;
  }

  return DEPARTMENT_NON_MATCH_BLEED * 0.55;
}

function getMatchedAudienceKeys(departmentValues: string[]): Set<string> {
  const keys = new Set<string>();
  for (const segment of GLOBAL_AUDIENCE_SEGMENTS) {
    if (segment.departments?.some((d) => departmentValues.includes(d))) {
      keys.add(segment.key);
    }
  }
  return keys;
}

/** Lead estimate weighted toward department-matched audience when a department filter is active. */
function resolveFilteredLeadAudience(specs: LeadSpecs, stats: GlobalAudienceStat[]): number {
  const deptValues = specs.department;
  if (!deptValues.length) {
    return stats.reduce((sum, s) => sum + s.count, 0);
  }

  const matchedKeys = getMatchedAudienceKeys(deptValues);
  let matched = 0;
  let bleed = 0;
  for (const stat of stats) {
    if (matchedKeys.has(stat.key)) matched += stat.count;
    else bleed += stat.count;
  }
  return matched + bleed * 0.07;
}

export function computeGlobalAudienceStats(specs: LeadSpecs): GlobalAudienceStat[] {
  const filters = specsToFilters(specs);
  const hasFilters = filters.length > 0;
  const nonDeptMultiplier = getNonDepartmentFilterMultiplier(filters);
  const departmentValues = specs.department;

  return GLOBAL_AUDIENCE_SEGMENTS.map((segment) => {
    const baseCount = Math.round(segment.millions * 1_000_000);

    if (!hasFilters) {
      return {
        key: segment.key,
        label: segment.label,
        count: baseCount,
        formatted: formatAudienceMillions(segment.millions),
      };
    }

    let count = baseCount * nonDeptMultiplier;
    if (departmentValues.length) {
      count *= getDepartmentSegmentMultiplier(segment, departmentValues);
    }

    count = Math.max(1, Math.round(count));
    return {
      key: segment.key,
      label: segment.label,
      count,
      formatted: formatAudienceLac(count),
      highlighted:
        departmentValues.length > 0 &&
        segment.departments?.some((d) => departmentValues.includes(d)),
    };
  });
}

export function analyzeLeadSpecs(specs: LeadSpecs): CheckDataResults {
  const summary = estimateLeadVolume(specs);

  return {
    ...summary,
    previewRecords: generatePreviewRecords(specs, PREVIEW_ROW_COUNT),
  };
}

export async function analyzeLeadSpecsAsync(
  specs: LeadSpecs,
  options?: { signal?: AbortSignal; minDelayMs?: number }
): Promise<CheckDataResults> {
  const minDelay = options?.minDelayMs ?? computeAnalysisDelayMs(specs);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, minDelay);
    options?.signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  return analyzeLeadSpecs(specs);
}
