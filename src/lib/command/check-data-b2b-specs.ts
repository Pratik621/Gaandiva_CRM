/** Structured Apollo-style B2B spec catalog — unique to Advanced B2B Specs (no duplicates of main form). */

export type B2BSpecFieldKey =
  | "clinical_specialty"
  | "target_seniority"
  | "job_function"
  | "healthcare_payers"
  | "pharma_biotech"
  | "medtech_functions"
  | "care_setting"
  | "therapeutic_area"
  | "healthcare_it_stack"
  | "compliance_certification"
  | "buying_intent"
  | "account_tier"
  | "growth_signals"
  | "payer_mix"
  | "facility_scale"
  | "gpo_affiliation"
  | "clinical_trial_phase";

export interface B2BSpecCatalogItem {
  key: B2BSpecFieldKey;
  label: string;
  description: string;
  placeholder: string;
  options: string[];
  /** Tighter = fewer matching leads when applied (Apollo-style niche filters). */
  narrowFactor: number;
}

export interface B2BSpecEntry {
  id: string;
  fieldKey: B2BSpecFieldKey;
  values: string[];
}

export const B2B_SPEC_CATALOG: B2BSpecCatalogItem[] = [
  {
    key: "clinical_specialty",
    label: "Clinical Specialties",
    description: "Clinics only — excludes hospitals",
    placeholder: "Select clinical specialties",
    narrowFactor: 0.22,
    options: [
      "Allergy & Immunology",
      "Aesthetics",
      "Mental Health / Behavioral Health",
      "Cardiology",
      "Dermatology",
      "Emergency Medicine",
      "Endocrinology",
      "ENT / Otolaryngology",
      "Family Medicine",
      "Gastroenterology",
      "General Medicine",
      "Geriatric",
      "Internal Medicine",
      "Med Spa",
      "Nephrology",
      "Neurology",
      "OB/GYN",
      "Occupational Therapy",
      "Ophthalmology / Optometry",
      "Orthopedics",
      "Pain Management",
      "Pediatrics",
      "Physical Therapy & Rehab",
      "Podiatry",
      "Psychiatry",
      "Pulmonology",
      "Rheumatology",
      "Sleep Medicine",
      "Speech Therapy",
      "Sports Medicine",
      "Substance Abuse",
      "Plastic Surgery",
      "Urgent Care",
      "Urology",
      "Vascular",
    ],
  },
  {
    key: "target_seniority",
    label: "Seniority",
    description: "Healthcare-specific target titles (not generic job titles)",
    placeholder: "Select seniority / titles",
    narrowFactor: 0.26,
    options: [
      "Practice Owner",
      "Specialty IEN (Internationally Educated Nurse)",
      "Practice Manager",
      "Medical Director",
      "Chief Medical Officer",
      "Department Head",
      "Clinic Administrator",
      "Owner / Founder",
      "Partner Physician",
      "Nurse Practitioner",
      "Physician Assistant",
    ],
  },
  {
    key: "job_function",
    label: "Job Function",
    description: "Executive & operational functions (beyond standard departments)",
    narrowFactor: 0.28,
    placeholder: "Select job functions",
    options: [
      "Chief Digital Officer",
      "AI / Machine Learning",
      "Member / Patient Engagement",
      "Member / Patient Experience",
      "Member / Patient Access",
      "Clinical Operations",
      "Revenue Cycle Management",
      "Population Health",
      "Value-Based Care",
      "Quality & Compliance",
      "Health Information Exchange",
      "Interoperability / FHIR",
      "Telehealth Program Lead",
      "Care Coordination",
    ],
  },
  {
    key: "healthcare_payers",
    label: "Healthcare Payers (ABM)",
    description: "Target payer organization segments",
    narrowFactor: 0.18,
    placeholder: "Select payer segments",
    options: [
      "National Health Plans",
      "Regional / Blue Cross Blue Shield",
      "Medicare Advantage Plans",
      "Medicaid Managed Care",
      "Pharmacy Benefit Managers (PBM)",
      "Dental & Vision Carriers",
      "Behavioral Health Payers",
      "Self-Insured Employers",
      "ACO / Risk-Bearing Entities",
      "Government Payers",
    ],
  },
  {
    key: "pharma_biotech",
    label: "Pharma / Biotech Function",
    description: "Roles within pharma & biotech organizations",
    narrowFactor: 0.2,
    placeholder: "Select pharma / biotech functions",
    options: [
      "R&D / Translational Science",
      "Clinical Development",
      "Biostatistics / Clinical Data Science",
      "Regulatory Affairs / Quality",
      "Medical Affairs / HEOR",
      "CMC / Manufacturing (Advanced Therapies)",
      "Commercial / Market Access",
      "Pharmacovigilance",
      "Digital Therapeutics",
      "Cell & Gene Therapy",
    ],
  },
  {
    key: "medtech_functions",
    label: "Medtech Function",
    description: "Roles within medtech & device companies",
    narrowFactor: 0.21,
    placeholder: "Select medtech functions",
    options: [
      "R&D / Engineering / Product Development",
      "Clinical & Regulatory Affairs",
      "Quality & Compliance",
      "Data Science / Digital Health",
      "Market Access / Commercial Strategy",
      "Clinical End Users / Specialists",
      "Medical Device Sales",
      "Hospital Systems Integration",
      "Diagnostics & Imaging",
      "Surgical Robotics",
    ],
  },
  {
    key: "care_setting",
    label: "Care Setting",
    description: "Where care is delivered — distinct from industry vertical",
    narrowFactor: 0.25,
    placeholder: "Select care settings",
    options: [
      "Ambulatory / Outpatient",
      "Ambulatory Surgery Center (ASC)",
      "Inpatient Hospital",
      "Skilled Nursing Facility",
      "Home Health & Hospice",
      "Long-Term Care",
      "Retail / Pharmacy Clinic",
      "Telehealth-Only Practice",
      "Imaging Center",
      "Dialysis Center",
      "Rehabilitation Facility",
    ],
  },
  {
    key: "therapeutic_area",
    label: "Therapeutic Area",
    description: "Pharma / biotech disease & therapy focus",
    narrowFactor: 0.19,
    placeholder: "Select therapeutic areas",
    options: [
      "Oncology",
      "Rare Disease / Orphan",
      "Immunology",
      "CNS / Neurology",
      "Cardiovascular",
      "Metabolic / Diabetes",
      "Infectious Disease",
      "Respiratory",
      "Dermatology",
      "Ophthalmology",
      "Women's Health",
      "Gene & Cell Therapy",
    ],
  },
  {
    key: "healthcare_it_stack",
    label: "Healthcare IT Stack",
    description: "EHR, clinical & payer systems (healthcare-specific tech)",
    narrowFactor: 0.23,
    placeholder: "Select healthcare IT systems",
    options: [
      "Epic",
      "Oracle Cerner",
      "Meditech",
      "Athenahealth",
      "eClinicalWorks",
      "Allscripts / Veradigm",
      "NextGen Healthcare",
      "Veeva CRM",
      "Salesforce Health Cloud",
      "Cotiviti / RCM Platforms",
      "InterSystems",
      "Philips IntelliSpace",
    ],
  },
  {
    key: "compliance_certification",
    label: "Compliance & Certification",
    description: "Regulatory & security posture filters",
    narrowFactor: 0.2,
    placeholder: "Select certifications",
    options: [
      "HIPAA Compliant",
      "HITRUST Certified",
      "SOC 2 Type II",
      "FDA 510(k) Cleared",
      "ISO 13485 (Med Device)",
      "Joint Commission Accredited",
      "URAC Accredited",
      "NCQA Accredited",
      "GDPR / EU MDR",
      "CMS Certified",
    ],
  },
  {
    key: "buying_intent",
    label: "Buying Intent Topics",
    description: "Active interest signals & initiative themes",
    narrowFactor: 0.17,
    placeholder: "Select intent topics",
    options: [
      "EHR Migration / Replacement",
      "Revenue Cycle Optimization",
      "Patient Engagement Platform",
      "Clinical Trial Management",
      "Value-Based Care Analytics",
      "Cybersecurity / HIPAA Risk",
      "AI / Clinical Decision Support",
      "Interoperability / Data Exchange",
      "Staffing & Workforce Solutions",
      "Telehealth Expansion",
      "Claims & Prior Authorization",
      "Population Health Management",
    ],
  },
  {
    key: "account_tier",
    label: "ABM Account Tier",
    description: "Strategic account prioritization tier",
    narrowFactor: 0.15,
    placeholder: "Select account tiers",
    options: [
      "Tier 1 — Strategic",
      "Tier 2 — Growth",
      "Tier 3 — Volume",
      "Named Account List",
      "Whitespace Account",
      "Customer Expansion",
      "Win-Back Target",
    ],
  },
  {
    key: "growth_signals",
    label: "Growth & Trigger Signals",
    description: "Recent events indicating buying readiness",
    narrowFactor: 0.16,
    placeholder: "Select growth signals",
    options: [
      "Recent Funding Round",
      "M&A Activity",
      "New Facility / Location Opening",
      "Executive Leadership Change",
      "Active RFP / Procurement",
      "Hiring Surge (Clinical)",
      "Hiring Surge (IT / Digital)",
      "Technology Refresh Cycle",
      "Regulatory Deadline Pressure",
      "Contract Renewal Window",
    ],
  },
  {
    key: "payer_mix",
    label: "Payer Mix Profile",
    description: "Dominant reimbursement mix of target accounts",
    narrowFactor: 0.24,
    placeholder: "Select payer mix profiles",
    options: [
      "Medicare-Heavy",
      "Medicaid-Heavy",
      "Commercial-Dominant",
      "Dual Eligible Population",
      "Self-Pay / Uninsured Mix",
      "Capitated / Risk-Based",
      "Fee-for-Service Dominant",
      "Mixed Payer Portfolio",
    ],
  },
  {
    key: "facility_scale",
    label: "Facility Scale",
    description: "Sites, beds & locations — not employee headcount",
    narrowFactor: 0.27,
    placeholder: "Select facility scale",
    options: [
      "Single Location",
      "2–5 Locations",
      "6–20 Locations",
      "21–50 Locations",
      "50+ Locations",
      "100–299 Licensed Beds",
      "300–499 Licensed Beds",
      "500+ Licensed Beds",
    ],
  },
  {
    key: "gpo_affiliation",
    label: "GPO / Purchasing Network",
    description: "Group purchasing & procurement affiliations",
    narrowFactor: 0.14,
    placeholder: "Select GPO affiliations",
    options: [
      "Vizient",
      "Premier Inc.",
      "HealthTrust",
      "Intalere",
      "Amerinet",
      "Provista",
      "Independent / No GPO",
      "Regional Purchasing Coalition",
    ],
  },
  {
    key: "clinical_trial_phase",
    label: "Clinical Trial Phase",
    description: "Active trial stage for pharma / research targeting",
    narrowFactor: 0.13,
    placeholder: "Select trial phases",
    options: [
      "Pre-Clinical",
      "Phase I",
      "Phase II",
      "Phase III",
      "Phase IV / Post-Market",
      "Expanded Access",
      "Investigator-Initiated",
    ],
  },
];

export function getB2BSpecDefinition(key: B2BSpecFieldKey): B2BSpecCatalogItem {
  return B2B_SPEC_CATALOG.find((c) => c.key === key) ?? B2B_SPEC_CATALOG[0];
}

export function createB2BSpecEntry(fieldKey?: B2BSpecFieldKey): B2BSpecEntry {
  const usedDefault = fieldKey ?? B2B_SPEC_CATALOG[0].key;
  return {
    id: `b2b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fieldKey: usedDefault,
    values: [],
  };
}

export function getAvailableB2BFieldKeys(usedKeys: Set<B2BSpecFieldKey>, current?: B2BSpecFieldKey): B2BSpecFieldKey[] {
  return B2B_SPEC_CATALOG.map((c) => c.key).filter((k) => k === current || !usedKeys.has(k));
}
