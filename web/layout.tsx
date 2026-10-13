import localized from "../locales/zh.json" with { type: "json" };
import {
  Check,
  ListFilter,
  ListPlus,
  Tag,
  LockKeyholeOpen,
  UserRound,
  EllipsisVertical,
  ListChecks,
  Copy,
  Box,
  Folder,
  Plus,
  Save,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  X,
  ArrowUp,
  Layers,
  Link,
  RefreshCw,
  Trash2,
  LayoutGrid,
  List,
  Search,
} from "lucide-react";
import { Button } from "./button.js";
import React, { useRef, useState } from "react";
import { useOutsideClose } from "./action-tools.js";
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
      aria-label={name}
      title={name}
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
  const accountRef = useRef<HTMLDetailsElement>(null);
  useOutsideClose(accountRef, true, () => {
    if (accountRef.current) accountRef.current.open = false;
  });
  return (
    <div className="layout">
      <nav aria-label={localized["Main navigation"]}>
        <h1>
          <img className="brand-mark" src="/apple-touch-icon.png" alt="" />
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
              ref={accountRef}
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
            <summary>
              <Icon name="forward" />
              <span>{date || localized["Browse by date"]}</span>
            </summary>
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
  status,
  children,
}: {
  title: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    // Keeps its slot so neighbouring actions do not shift.
    hidden?: boolean;
    icon?: "save" | "add";
  };
  secondaryActions?: {
    label: string;
    icon?: keyof typeof icons;
    iconOnly?: boolean;
    pressed?: boolean;
    onClick: () => void;
    disabled?: boolean;
    hidden?: boolean;
  }[];
  onBack?: () => void;
  onMore?: () => void;
  showView?: boolean;
  search?: { value: string; onChange: (value: string) => void };
  /** Short save state beside the title; the header keeps its height. */
  status?: string;
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
            {status !== undefined && (
              <span role="status" className="page-status" title={status}>
                {status}
              </span>
            )}
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
                  <Icon name="cards" />
                </Button>
                <Button
                  variant="ghost"
                  aria-label={localized["List"]}
                  title={localized["List view"]}
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  <Icon name="list" />
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
                variant={action.iconOnly ? "icon" : "secondary"}
                className={action.hidden ? "slot-hidden" : undefined}
                aria-label={action.iconOnly ? action.label : undefined}
                title={action.iconOnly ? action.label : undefined}
                aria-pressed={action.pressed}
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {action.icon && <Icon name={action.icon} />}
                {!action.iconOnly && action.label}
              </Button>
            ))}
            {primaryAction && (
              <Button
                variant="primary"
                className={
                  "page-primary" +
                  (secondaryActions?.length ? " compact" : "") +
                  (primaryAction.hidden ? " slot-hidden" : "")
                }
                aria-label={primaryAction.label}
                title={primaryAction.label}
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
              >
                <Icon name={primaryAction.icon === "save" ? "check" : "add"} />
                <span className="page-primary-label">
                  {primaryAction.label}
                </span>
              </Button>
            )}
          </div>
        </header>
        {search && (
          <div className="page-search" role="search">
            <Icon name="search" />
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

const icons = {
  check: Check,
  filter: ListFilter,
  sectionAdd: ListPlus,
  group: Tag,
  unlock: LockKeyholeOpen,
  user: UserRound,
  moreVertical: EllipsisVertical,
  checklist: ListChecks,
  template: Copy,
  item: Box,
  category: Folder,
  add: Plus,
  save: Save,
  edit: Pencil,
  back: ChevronLeft,
  forward: ChevronRight,
  more: Ellipsis,
  close: X,
  up: ArrowUp,
  source: Layers,
  link: Link,
  refresh: RefreshCw,
  trash: Trash2,
  cards: LayoutGrid,
  list: List,
  search: Search,
};

export function Icon({ name }: { name: keyof typeof icons }) {
  const Component = icons[name];
  return <Component className="icon" aria-hidden="true" />;
}
