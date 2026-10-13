import localized from "../locales/zh.json" with { type: "json" };
import { t } from "./i18n.js";
import React, { useRef, useState, useEffect, useLayoutEffect } from "react";
import { Icon } from "./layout.js";

// Closes a menu when a pointer goes down outside it; capture keeps the target's own focus.
export function useOutsideClose(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [active]);
}

const desktop = "(min-width: 651px)";

export function ActionTools({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [wide, setWide] = useState(() => matchMedia(desktop).matches);
  const [open, setOpen] = useState(wide);
  useEffect(() => {
    const media = matchMedia(desktop);
    const change = () => {
      setWide(media.matches);
      setOpen(media.matches);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useOutsideClose(ref, open && !wide, () => setOpen(false));
  useLayoutEffect(() => {
    const tools = ref.current!;
    const row = tools.closest<HTMLElement>(".record-card, .entry");
    if (!row || !open || wide) return;
    const content = tools.querySelector<HTMLElement>(".action-tools-content")!;
    const measure = () =>
      row.style.setProperty("--tools-width", `${content.offsetWidth}px`);
    measure();
    row.classList.add("tools-open");
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => {
      observer.disconnect();
      row.classList.remove("tools-open");
      row.style.removeProperty("--tools-width");
    };
  }, [open, wide]);
  return (
    <details
      className="action-tools"
      ref={ref}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && ref.current?.open) {
          event.stopPropagation();
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={t(localized["Actions "]) + name} title={t(localized["Actions"])}>
        <Icon name="more" />
      </summary>
      <div className="action-tools-content">{children}</div>
    </details>
  );
}
