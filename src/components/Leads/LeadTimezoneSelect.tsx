"use client";

import { useMemo } from "react";
import { Select } from "antd";
import {
  buildLeadTimezoneSelectOptions,
  filterLeadTimezoneOption,
  type LeadTimezoneSelectOption,
} from "@/lib/lead-timezone-catalog";

type LeadTimezoneSelectProps = {
  value?: string;
  onChange?: (ianaTimezone: string) => void;
  /** Saved value for edit mode — keeps legacy zones selectable. */
  knownValue?: string | null;
};

export function LeadTimezoneSelect({
  value,
  onChange,
  knownValue,
}: LeadTimezoneSelectProps) {
  const options = useMemo(
    () => buildLeadTimezoneSelectOptions(knownValue ?? value),
    [knownValue, value]
  );

  return (
    <Select<string, LeadTimezoneSelectOption>
      showSearch
      placeholder="Search country or city..."
      options={options}
      value={value}
      onChange={onChange}
      filterOption={(input, option) =>
        filterLeadTimezoneOption(input, option as LeadTimezoneSelectOption | undefined)
      }
      style={{ width: "100%" }}
      listHeight={360}
      popupMatchSelectWidth={false}
      styles={{ popup: { root: { maxWidth: 520 } } }}
    />
  );
}
