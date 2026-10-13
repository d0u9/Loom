import localized from "../locales/zh.json" with { type: "json" };
import React from "react";
import { t } from "./i18n.js";
import { Select } from "./select.js";

export function matchesItemGroup(
  item: { itemGroup?: string | null },
  group: string | null,
) {
  return group === null || (item.itemGroup ?? "") === group;
}

export function ItemGroupFilter({
  groups,
  value,
  onChange,
  disabled,
}: {
  groups: string[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      label={t(localized["Filter by catalog group"])}
      value={value === null ? "all" : "group:" + value}
      onChange={(next) => onChange(next === "all" ? null : next.slice(6))}
      disabled={disabled}
      options={[
        { value: "all", label: t(localized["All"]) },
        { value: "group:", label: t(localized["Ungrouped"]) },
        ...groups.map((group) => ({ value: "group:" + group, label: group })),
      ]}
    />
  );
}
