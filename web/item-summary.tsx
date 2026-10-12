import localized from "../locales/zh.json" with { type: "json" };
import React from "react";

export function ItemSummary({
  item,
  categories,
  name,
  currentCategoryId,
  maxTags = 2,
}: {
  item: any;
  categories: any[];
  name?: React.ReactNode;
  currentCategoryId?: string;
  maxTags?: number;
}) {
  const names = (item.categoryIds ?? [])
    .filter((id: string) => id !== currentCategoryId)
    .map((id: string) => categories.find((c) => c.id === id)?.name)
    .filter(Boolean);
  // With room for one tag, several categories collapse into a single count.
  const shown =
    names.length <= maxTags ? names : names.slice(0, maxTags > 1 ? maxTags : 0);
  const rest = names.length - shown.length;
  return (
    <div className="item-summary">
      <div className="item-summary-name">{name ?? <h3>{item.name}</h3>}</div>
      <p className="item-note" title={item.note ?? ""}>
        {item.note ?? ""}
      </p>
      <div
        className="category-tags"
        aria-label={localized["Group and categories"]}
        title={names.join(" · ")}
      >
        <span
          className="category-tag item-group-tag"
          aria-label={localized["Group label prefix"] + (item.itemGroup || localized["Ungrouped"])}
          title={localized["Group label prefix"] + (item.itemGroup || localized["Ungrouped"])}
        >
          Group · {item.itemGroup || localized["Ungrouped"]}
        </span>
        {shown.map((name: string) => (
          <span className="category-tag" key={name}>
            {name}
          </span>
        ))}
        {rest > 0 && (
          <span className="category-tag category-tag-more">
            {shown.length ? "+" + rest : rest + localized[" categories"]}
          </span>
        )}
      </div>
    </div>
  );
}
