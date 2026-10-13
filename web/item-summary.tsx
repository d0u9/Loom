import localized from "../locales/zh.json" with { type: "json" };
import { t } from "./i18n.js";
import React, { useLayoutEffect, useRef } from "react";
import { Icon } from "./layout.js";

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
  const noteRef = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const note = noteRef.current!;
    const update = () => {
      note.dataset.overflow = String(note.scrollWidth > note.clientWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(note);
    return () => observer.disconnect();
  }, [item.note]);
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
      <p ref={noteRef} className="item-note" title={item.note ?? ""}>
        {item.note ?? ""}
      </p>
      <div
        className="category-tags"
        aria-label={t(localized["Group and categories"])}
        title={names.join(" · ")}
      >
        <span
          className="category-tag item-group-tag"
          aria-label={t(localized["Group:"]) + (item.itemGroup || t(localized["Ungrouped"]))}
          title={t(localized["Group:"]) + (item.itemGroup || t(localized["Ungrouped"]))}
        >
          <Icon name="group" />
          <span>{item.itemGroup || t(localized["Ungrouped"])}</span>
        </span>
        {shown.map((name: string) => (
          <span className="category-tag category-detail-tag" key={name}>
            {name}
          </span>
        ))}
        {rest > 0 && (
          <span className="category-tag category-tag-more category-detail-tag">
            {shown.length ? "+" + rest : rest + t(localized[" categories"])}
          </span>
        )}
        {names.length > 1 && (
          <span
            className="category-tag category-compact-tag"
            title={names.join(" · ")}
          >
            {names.length}
            {t(localized["categories"])}
          </span>
        )}
      </div>
    </div>
  );
}
