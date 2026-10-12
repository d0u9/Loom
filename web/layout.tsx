import localized from "../locales/zh.json" with { type: "json" };
import { Button } from "./button.js";
import React, { useState } from "react";
import { ViewContext } from "./collection.js";
import { Calendar } from "./calendar.js";
import { resourcePath } from "./router.js";

function NavigationLink({
  name,
  active,
  onNavigate,
}: {
  name: string;
  active: boolean;
  onNavigate: () => void;
}) {
  const icons = {
    Checklist: "checklist",
    Template: "template",
    Item: "item",
    Category: "category",
  } as const;
  return (
    <a
      className="nav-link"
      href={resourcePath(name)}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        onNavigate();
      }}
    >
      <Icon name={icons[name as keyof typeof icons]} />
      <span>{name}</span>
    </a>
  );
}

export function AppLayout({
  username,
  section,
  date,
  schedule,
  onSection,
  onDate,
  onLogout,
  children,
}: {
  username: string;
  section: string;
  date: string | null;
  schedule: any[];
  onSection: (section: string) => void;
  onDate: (date: string | null) => void;
  onLogout?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="layout">
      <nav aria-label={localized["Main navigation"]}>
        <h1>
          <img className="brand-mark" src="/loom.svg" alt="" />
          Loom
        </h1>
        <Calendar date={date} documents={schedule} onSelect={onDate} />
        {["Checklist", "Template", "Item", "Category"].map((name) => (
          <NavigationLink
            key={name}
            name={name}
            active={section === name}
            onNavigate={() => onSection(name)}
          />
        ))}
        <footer className={"sidebar-account" + (onLogout ? "" : " anonymous")}>
          <Icon name={onLogout ? "user" : "unlock"} />
          <span className="account-name">{onLogout ? username : localized["No sign-in required"]}</span>
          {onLogout && (
            <details
              className="account-actions"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector("summary")?.focus();
                }
              }}
            >
              <summary aria-label={localized["Account menu"]} title={localized["Account menu"]}>
                <Icon name="moreVertical" />
              </summary>
              <div className="account-menu">
                <Button onClick={onLogout}>{localized["Sign out"]}</Button>
              </div>
            </details>
          )}
        </footer>
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

// View choice is shared by all pages and remembered per browser.
function readView() {
  try {
    return localStorage.getItem("loom.view") === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

export function Page({
  title,
  primaryAction,
  secondaryActions,
  onBack,
  onMore,
  showView = true,
  search,
  children,
}: {
  title: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    icon?: "save" | "add";
  };
  secondaryActions?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }[];
  onBack?: () => void;
  onMore?: () => void;
  showView?: boolean;
  search?: { value: string; onChange: (value: string) => void };
  children: React.ReactNode;
}) {
  const [view, setViewState] = useState(readView);
  const setView = (next: string) => {
    setViewState(next);
    try {
      localStorage.setItem("loom.view", next);
    } catch {}
  };
  return (
    <ViewContext.Provider value={view}>
      <section className="page">
        <header className="page-header">
          <div className="page-title">
            {onBack && (
              <Button
                variant="icon"
                aria-label={localized["Back"]}
                title={localized["Back"]}
                onClick={onBack}
              >
                <Icon name="back" />
              </Button>
            )}
            <h2>{title}</h2>
          </div>
          <div className="page-actions">
            {showView && (
              <div className="view-switch" aria-label={localized["View"]}>
                <Button
                  variant="ghost"
                  aria-label={localized["Cards"]}
                  title={localized["Card view"]}
                  aria-pressed={view === "cards"}
                  onClick={() => setView("cards")}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <rect x="4" y="4" width="6" height="6" rx="1" />
                    <rect x="14" y="4" width="6" height="6" rx="1" />
                    <rect x="4" y="14" width="6" height="6" rx="1" />
                    <rect x="14" y="14" width="6" height="6" rx="1" />
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  aria-label={localized["List"]}
                  title={localized["List view"]}
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
                  </svg>
                </Button>
              </div>
            )}
            {onMore && (
              <Button
                variant="icon"
                aria-label={localized["More actions"]}
                title={localized["More actions"]}
                onClick={onMore}
              >
                <Icon name="more" />
              </Button>
            )}
            {secondaryActions?.map((action) => (
              <Button
                key={action.label}
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {action.label}
              </Button>
            ))}
            {primaryAction && (
              <Button
                variant="primary"
                className={
                  "page-primary" + (secondaryActions?.length ? " compact" : "")
                }
                aria-label={primaryAction.label}
                title={primaryAction.label}
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path
                    d={
                      primaryAction.icon === "save"
                        ? "M5 12l4 4L19 6"
                        : "M12 5v14M5 12h14"
                    }
                  />
                </svg>
                <span className="page-primary-label">
                  {primaryAction.label}
                </span>
              </Button>
            )}
          </div>
        </header>
        {search && (
          <div className="page-search" role="search">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              type="search"
              aria-label={localized["Search"]}
              placeholder={localized["Search…"]}
              data-1p-ignore="true"
              autoComplete="off"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") search.onChange("");
              }}
            />
            {search.value && (
              <Button
                variant="icon"
                aria-label={localized["Clear search"]}
                onClick={() => search.onChange("")}
              >
                <Icon name="close" />
              </Button>
            )}
          </div>
        )}
        {children}
      </section>
    </ViewContext.Provider>
  );
}

const iconPaths = {
  unlock: "M7 11V7a5 5 0 0 1 9-3M5 11h14v10H5zM12 15v2",
  user: "M20 21v-2a8 8 0 0 0-16 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  moreVertical: "M12 5h.01M12 12h.01M12 19h.01",
  checklist: "M9 6h11M9 12h11M9 18h11M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2",
  template: "M8 3h12v14M4 7h12v14H4zM7 11h6M7 15h6",
  item: "M12 3l9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8",
  category: "M3 7V5h6l2 2h10v13H3z",
  add: "M12 5v14M5 12h14",
  save: "M5 4h12l3 3v13H4V4zM8 4v6h8V4M8 20v-7h8v7",
  edit: "M15 5l4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z",
  back: "M15 5l-7 7 7 7",
  forward: "M9 5l7 7-7 7",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  close: "M6 6l12 12M18 6L6 18",
  up: "M12 19V5M6 11l6-6 6 6",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7",
};

export function Icon({ name }: { name: keyof typeof iconPaths }) {
  return (
    <svg
      className="icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      style={name === "more" ? { strokeWidth: 3 } : undefined}
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}
