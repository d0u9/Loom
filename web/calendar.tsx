import localized from "../locales/zh.json" with { type: "json" };
import { Button } from "./button.js";
import React, { useState } from "react";
import { Icon } from "./layout.js";
const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function Calendar({
  date,
  documents,
  onSelect,
}: {
  date: string | null;
  documents: any[];
  onSelect: (date: string | null) => void;
}) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const today = dateKey(new Date());
  const counts = new Map<string, number>();
  for (const d of documents)
    if (d.kind === "checklist" && d.useDate)
      counts.set(d.useDate, (counts.get(d.useDate) || 0) + 1);
  const start = new Date(
    month.getFullYear(),
    month.getMonth(),
    1 - month.getDay(),
  );
  const weeks = Math.ceil(
    (month.getDay() +
      new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) /
      7,
  );
  return (
    <section className="calendar" aria-label={localized["Checklist calendar"]}>
      <div className="calendar-title">
        <strong>
          {month.toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "long",
          })}
        </strong>
        <div>
          <Button
            variant="ghost"
            aria-label={localized["Previous month"]}
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            <Icon name="back" />
          </Button>
          <Button
            variant="ghost"
            aria-label={localized["Next month"]}
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            <Icon name="forward" />
          </Button>
        </div>
      </div>
      <div className="calendar-grid">
        {[localized["Sun"], localized["Mon"], localized["Tue"], localized["Wed"], localized["Thu"], localized["Fri"], localized["Sat"]].map((d) => (
          <span className="weekday" key={d}>
            {d}
          </span>
        ))}
        {Array.from({ length: weeks * 7 }, (_, i) => {
          const day = new Date(
              start.getFullYear(),
              start.getMonth(),
              start.getDate() + i,
            ),
            key = dateKey(day),
            count = counts.get(key) || 0;
          return (
            <Button
              variant="ghost"
              key={key}
              className={`${day.getMonth() !== month.getMonth() ? "outside" : ""} ${date === key ? "selected" : ""} ${today === key ? "today" : ""}`}
              aria-label={`${key}${localized["Calendar count separator"]}${count}${localized[" checklists"]}`}
              aria-pressed={date === key}
              aria-current={today === key ? "date" : undefined}
              onClick={() => onSelect(key)}
            >
              {day.getDate()}
              {count > 0 && <span className="calendar-dot" />}
            </Button>
          );
        })}
      </div>
      <div className="calendar-actions">
        <Button
          variant="ghost"
          onClick={() => {
            const now = new Date();
            setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
            onSelect(today);
          }}
        >{localized["\n          Today\n        "]}</Button>
        <Button variant="ghost" onClick={() => onSelect(null)}>{localized["\n          All checklists\n        "]}</Button>
      </div>
    </section>
  );
}
