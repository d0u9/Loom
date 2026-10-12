import localized from "../locales/zh.json" with { type: "json" };
import React, { useEffect, useRef } from "react";

export function SortableRow({
  id,
  disabled,
  onMove,
  onStep,
  drop,
  dragLabel,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  id?: string;
  disabled?: boolean;
  onMove?: (target: string) => void;
  onStep?: (direction: number) => void;
  dragLabel?: string;
  drop?: { selector: string; onDrop: (target: HTMLElement) => void };
}) {
  const ref = useRef<HTMLElement>(null);
  const start = useRef<{ x: number; y: number; time: number } | null>(null);
  const suppressClick = useRef(false);
  const hovered = useRef<HTMLElement | null>(null);
  const preview = useRef<HTMLDivElement | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabled = !!(onMove || drop) && !disabled;
  function hover(x: number, y: number) {
    const target = drop
      ? (document.elementFromPoint(x, y)?.closest<HTMLElement>(drop.selector) ??
        null)
      : null;
    hovered.current?.classList.remove("drop-hover");
    hovered.current = target;
    target?.classList.add("drop-hover");
  }
  function clearHover() {
    hovered.current?.classList.remove("drop-hover");
    hovered.current = null;
  }
  function lift(x: number, y: number) {
    if (!preview.current) {
      const ghost = document.createElement("div");
      ghost.className = "drag-preview";
      ghost.textContent = dragLabel || localized["fixture.fee60ae594c1"];
      ghost.setAttribute("aria-hidden", "true");
      document.body.appendChild(ghost);
      preview.current = ghost;
      ref.current?.classList.add("is-dragging");
    }
    const ghost = preview.current;
    ghost.style.left = `${Math.max(12, Math.min(x + 16, window.innerWidth - ghost.offsetWidth - 12))}px`;
    ghost.style.top = `${Math.max(12, Math.min(y + 16, window.innerHeight - ghost.offsetHeight - 12))}px`;
    hover(x, y);
  }
  function clearDrag() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    preview.current?.remove();
    preview.current = null;
    ref.current?.classList.remove("is-dragging");
    clearHover();
  }
  function cancel() {
    start.current = null;
    clearDrag();
  }
  useEffect(() => {
    if (!enabled) cancel();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", escape);
      cancel();
    };
  }, [enabled]);
  function interactive(target: EventTarget | null) {
    const control = (target as HTMLElement)?.closest(
      "button,input,textarea,select,a",
    );
    return !!control && !control.classList.contains("card-open");
  }
  function finish(x: number, y: number) {
    const from = start.current;
    start.current = null;
    clearDrag();
    if (!from || Math.hypot(x - from.x, y - from.y) < 6) return;
    const dropTarget =
      drop &&
      document.elementFromPoint(x, y)?.closest<HTMLElement>(drop.selector);
    if (dropTarget) drop.onDrop(dropTarget);
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    const target = document.elementFromPoint(x, y)?.closest("[data-sort-id]");
    if (target && target.parentElement === ref.current?.parentElement) {
      onMove?.(target.getAttribute("data-sort-id")!);
    }
  }
  useEffect(() => {
    const row = ref.current;
    if (!row || !enabled) return;
    const begin = (e: TouchEvent) => {
      if (interactive(e.target) || e.touches.length !== 1) return;
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY, time: Date.now() };
      holdTimer.current = setTimeout(() => {
        if (start.current) lift(start.current.x, start.current.y);
      }, 250);
    };
    const move = (e: TouchEvent) => {
      if (!start.current) return;
      const t = e.touches[0];
      // Hold before dragging so ordinary swipes still scroll the list.
      if (Date.now() - start.current.time < 250) {
        if (
          Math.hypot(t.clientX - start.current.x, t.clientY - start.current.y) >
          6
        )
          cancel();
        return;
      }
      e.preventDefault();
      lift(t.clientX, t.clientY);
    };
    const end = (e: TouchEvent) => {
      if (!start.current) return;
      if (Date.now() - start.current.time >= 250) {
        e.preventDefault();
        finish(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      } else cancel();
    };
    row.addEventListener("touchstart", begin, { passive: true });
    row.addEventListener("touchmove", move, { passive: false });
    row.addEventListener("touchend", end, { passive: false });
    row.addEventListener("touchcancel", cancel);
    return () => {
      row.removeEventListener("touchstart", begin);
      row.removeEventListener("touchmove", move);
      row.removeEventListener("touchend", end);
      row.removeEventListener("touchcancel", cancel);
    };
  });
  return (
    <article
      {...props}
      ref={ref}
      data-sort-id={id}
      onPointerDown={(e) => {
        if (
          !enabled ||
          e.pointerType === "touch" ||
          e.button !== 0 ||
          interactive(e.target)
        )
          return;
        start.current = { x: e.clientX, y: e.clientY, time: Date.now() };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const from = start.current;
        if (
          e.pointerType !== "touch" &&
          from &&
          Math.hypot(e.clientX - from.x, e.clientY - from.y) >= 6
        ) {
          e.currentTarget.setPointerCapture(e.pointerId);
          lift(e.clientX, e.clientY);
        }
      }}
      onPointerUp={(e) => {
        if (e.pointerType !== "touch") finish(e.clientX, e.clientY);
      }}
      onPointerCancel={(e) => {
        if (e.pointerType !== "touch") {
          cancel();
        }
      }}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.preventDefault();
          e.stopPropagation();
          suppressClick.current = false;
        }
      }}
      onKeyDown={(e) => {
        if (!enabled || !onStep || interactive(e.target)) return;
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          onStep?.(e.key === "ArrowUp" ? -1 : 1);
        }
      }}
    >
      {children}
    </article>
  );
}
