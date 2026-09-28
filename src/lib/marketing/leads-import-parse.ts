import * as XLSX from "xlsx";

export interface ParsedLeadRow {
  name: string;
  phone: string;
  email: string;
  property: string;
  notes: string;
}

const NAME_KEYS = ["name", "lead name", "full name"];
const PHONE_KEYS = ["phone", "phone number", "mobile", "contact", "contact number"];
const EMAIL_KEYS = ["email", "email address"];
const PROPERTY_KEYS = ["property", "property count", "properties"];
const NOTES_KEYS = ["notes", "note", "comment", "comments"];

function findKey(row: Record<string, unknown>, candidates: string[]): string | undefined {
  return Object.keys(row).find((k) => candidates.includes(k.trim().toLowerCase()));
}

export function parseLeadsExcelFile(buffer: ArrayBuffer): ParsedLeadRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rows
    .map((row) => {
      const nameKey = findKey(row, NAME_KEYS);
      const phoneKey = findKey(row, PHONE_KEYS);
      const emailKey = findKey(row, EMAIL_KEYS);
      const propertyKey = findKey(row, PROPERTY_KEYS);
      const notesKey = findKey(row, NOTES_KEYS);
      return {
        name: nameKey ? String(row[nameKey] ?? "").trim() : "",
        phone: phoneKey ? String(row[phoneKey] ?? "").trim() : "",
        email: emailKey ? String(row[emailKey] ?? "").trim() : "",
        property: propertyKey ? String(row[propertyKey] ?? "").trim() : "",
        notes: notesKey ? String(row[notesKey] ?? "").trim() : "",
      };
    })
    .filter((r) => r.name || r.phone || r.email);
}
