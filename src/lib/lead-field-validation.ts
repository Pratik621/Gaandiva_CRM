import type { Rule } from "antd/es/form";

/** Digits plus common phone symbols — no letters. */
export const PHONE_NUMERIC_PATTERN = /^[\d+\-().\s]*$/;

/** Digits only (e.g. founded year). */
export const DIGITS_ONLY_PATTERN = /^\d*$/;

export function phoneNumericFormRules(fieldLabel: string): Rule[] {
  return [
    {
      validator: async (_rule, value) => {
        if (value == null || String(value).trim() === "") return;
        if (!PHONE_NUMERIC_PATTERN.test(String(value))) {
          throw new Error(
            `${fieldLabel} may only contain numbers and symbols (+, -, ., parentheses)`
          );
        }
      },
    },
  ];
}

export function digitsOnlyFormRules(fieldLabel: string): Rule[] {
  return [
    {
      validator: async (_rule, value) => {
        if (value == null || String(value).trim() === "") return;
        if (!DIGITS_ONLY_PATTERN.test(String(value))) {
          throw new Error(`${fieldLabel} may only contain numbers`);
        }
      },
    },
  ];
}

export function normalizePhoneNumeric(value: unknown): unknown {
  if (value == null || value === "") return value;
  return String(value).replace(/[^\d+\-().\s]/g, "");
}

export function normalizeDigitsOnly(value: unknown): unknown {
  if (value == null || value === "") return value;
  return String(value).replace(/\D/g, "");
}
