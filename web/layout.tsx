import localized from "../locales/zh.json" with { type: "json" };
import React from "react";
import { Calendar } from "./calendar.js";

export function AppLayout({
  section,
  date,
  schedule,
  onSection,
  onDate,
  onLogout,
  children,
}: {
  section: string;
  date: string | null;
  schedule: any[];
  onSection: (section: string) => void;
  onDate: (date: string | null) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="layout">
      <nav aria-label={localized["Main navigation"]}>
        <h1>
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          Loom
        </h1>
        <Calendar date={date} documents={schedule} onSelect={onDate} />
        {["Checklist", "Template", "Item", "Category"].map((name) => (
          <button
            key={name}
            className={section === name ? "selected" : ""}
            onClick={() => onSection(name)}
          >
            {name}
          </button>
        ))}
        <button onClick={onLogout}>{localized["Sign out"]}</button>
      </nav>
      <main>
        {
          <details className="mobile-calendar">
            <summary>{date || localized["Browse by date"]}</summary>
            <Calendar date={date} documents={schedule} onSelect={onDate} />
          </details>
        }
        {children}
      </main>
    </div>
  );
}

export function Page({
  title,
  onCreate,
  children,
}: {
  title: string;
  onCreate?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="page">
      <header className="page-header">
        <h2>{title}</h2>
        {onCreate && (
          <button className="primary" onClick={onCreate}>{localized["\n            New "]}{title}
          </button>
        )}
      </header>
      {children}
    </section>
  );
}
