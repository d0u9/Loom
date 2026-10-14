import localized from "../locales/zh.json" with { type: "json" };
import { t } from "./i18n.js";
import React from "react";
import { CircleAlert } from "lucide-react";
import { Select } from "./select.js";
import { Button } from "./button.js";
export const sameName = (items: any[], name?: string) =>
  name?.trim() ? items.filter((item) => item.name.trim() === name.trim()) : [];

export function ItemNameMatches({
  items,
  categories,
  categoryId,
  onSelect,
}: {
  items: any[];
  categories: any[];
  categoryId?: string;
  onSelect: (item: any) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="item-name-notice" role="status">
      <p>
        <CircleAlert className="icon" aria-hidden="true" />
        <span>{t(localized["An item with this name already exists. Select it to avoid creating a duplicate."])}</span>
      </p>
      {items.map((item) => (
        <Button
          key={item.id}
          disabled={!!categoryId && item.categoryIds.includes(categoryId)}
          title={[
            item.itemGroup || t(localized["Ungrouped"]),
            ...item.categoryIds.map(
              (id: string) => categories.find((c) => c.id === id)?.name,
            ),
          ].join(" · ")}
          onClick={() => onSelect(item)}
        >
          {categoryId && item.categoryIds.includes(categoryId)
            ? t(localized["Already in this category:"])
            : t(localized["Select existing item:"])}
          {item.name}
        </Button>
      ))}
    </div>
  );
}
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
