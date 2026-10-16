import localized from "../locales/zh.json" with { type: "json" };
import { t } from "./i18n.js";
import { ActionTools } from "./action-tools.js";
import { Button } from "./button.js";
import { SortableRow } from "./sortable.js";
import React, { createContext, useContext } from "react";

export const ViewContext = createContext("cards");
export function Collection({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={useContext(ViewContext) === "cards" ? "cards" : "records-list"}
    >
      {children}
    </div>
  );
}
export function RecordCard({
  name,
  sort,
  drop,
  onOpen,
  actions,
  children,
}: {
  name: string;
  sort?: {
    id: string;
    disabled: boolean;
    onMove: (target: string, after: boolean) => void;
    onStep: (direction: number) => void;
    onNest?: (target: string) => void;
  };
  drop?: {
    disabled: boolean;
    selector: string;
    onDrop: (target: HTMLElement) => void;
  };
  onOpen: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SortableRow
      className="record-card"
      dragLabel={name}
      tabIndex={sort ? 0 : undefined}
      aria-label={sort ? name : undefined}
      {...sort}
      disabled={sort?.disabled || drop?.disabled}
      drop={drop}
    >
      <Button
        variant="ghost"
        className="card-open"
        aria-label={t(localized["Open "]) + name}
        onClick={onOpen}
      />
      <div className="record-content">
        <div className="record-main">{children}</div>
        {actions && (
          <div className="record-actions">
            <ActionTools>{actions}</ActionTools>
          </div>
        )}
      </div>
    </SortableRow>
  );
}
