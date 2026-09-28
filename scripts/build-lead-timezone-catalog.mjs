/**
 * Parses src/data/lead-timezone-catalog.csv into src/data/lead-timezone-catalog.json
 * Run: node scripts/build-lead-timezone-catalog.mjs
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, "src/data/lead-timezone-catalog.csv");
const JSON_PATH = path.join(ROOT, "src/data/lead-timezone-catalog.json");

/** Minimal RFC-style CSV row parser (handles quoted fields with commas). */
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && next === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim().length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim().length > 0)) rows.push(row);
  }

  return rows;
}

function normalizeIso2(iso2, country) {
  const trimmed = (iso2 ?? "").trim();
  if (trimmed) return trimmed;
  if (country === "Namibia") return "NA";
  return "";
}

function main() {
  const csv = fs.readFileSync(CSV_PATH, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsvRows(csv);
  const [header, ...dataRows] = rows;
  const expected = [
    "country",
    "iso2",
    "city_region",
    "us_states",
    "iana_timezone",
    "windows_timezone",
    "utc_offset",
    "search_keywords",
  ];

  if (!header || header.join(",") !== expected.join(",")) {
    throw new Error(`Unexpected CSV header: ${header?.join(",")}`);
  }

  const seen = new Set();
  const entries = [];

  for (const cols of dataRows) {
    if (cols.length < 8) continue;
    const iana = cols[4].trim();
    if (!iana || seen.has(iana)) continue;
    seen.add(iana);

    const country = cols[0].trim();
    entries.push({
      country,
      iso2: normalizeIso2(cols[1], country),
      cityRegion: cols[2].trim(),
      usStates: cols[3].trim(),
      ianaTimezone: iana,
      windowsTimezone: cols[5].trim(),
      utcOffset: cols[6].trim(),
      searchKeywords: cols[7].trim(),
    });
  }

  entries.sort((a, b) => {
    const byCountry = a.country.localeCompare(b.country);
    if (byCountry !== 0) return byCountry;
    return a.cityRegion.localeCompare(b.cityRegion);
  });

  fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  console.log(`Wrote ${entries.length} timezone entries to ${JSON_PATH}`);
}

main();
