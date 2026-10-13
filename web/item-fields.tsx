import localized from "../locales/zh.json" with { type: "json" };
import { t } from "./i18n.js";
import React from "react";
import { Select } from "./select.js";
export function ItemFields({
  value,
  onChange,
  categories,
  itemGroups,
}: {
  value: any;
  onChange: (value: any) => void;
  categories: any[];
  itemGroups: string[];
}) {
  return (
    <>
      <Select
        label={t(localized["Catalog group"])}
        allowCustom
        placeholder={t(localized["Ungrouped"])}
        value={value.itemGroup ?? ""}
        options={[
          { value: "", label: t(localized["Ungrouped"]) },
          ...itemGroups.map((g) => ({ value: g, label: g })),
        ]}
        onChange={(itemGroup) => onChange({ ...value, itemGroup })}
      />
      <label>
        {t(localized["Note"])}
        <textarea
          data-1p-ignore="true"
          autoComplete="off"
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
        />
      </label>
      <fieldset className="category-choice-field">
        <legend>{t(localized["Categories"])}</legend>
        <div className="category-choices">
          {categories.length === 0 && (
            <p className="empty">{t(localized["No categories yet. You can add them later."])}</p>
          )}
          {categories.map((c) => (
            <label key={c.id}>
              <input
                data-1p-ignore="true"
                autoComplete="off"
                type="checkbox"
                checked={value.categoryIds.includes(c.id)}
                onChange={(e) =>
                  onChange({
                    ...value,
                    categoryIds: e.target.checked
                      ? [...value.categoryIds, c.id]
                      : value.categoryIds.filter((k: string) => k !== c.id),
                  })
                }
              />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
