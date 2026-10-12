import React, { useEffect, useRef } from "react";

export function SortableRow({
  id,
  disabled,
  onMove,
  onStep,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  id?: string;
  disabled?: boolean;
  onMove?: (target: string) => void;
  onStep?: (direction: number) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const start = useRef<{ x: number; y: number; time: number } | null>(null);
  const suppressClick = useRef(false);
  const enabled = !!onMove && !disabled;
  function interactive(target: EventTarget | null) {
    const control = (target as HTMLElement)?.closest(
      "button,input,textarea,select,a",
    );
    return !!control && !control.classList.contains("card-open");
  }
  function finish(x: number, y: number) {
    const from = start.current;
    start.current = null;
    if (!from || Math.hypot(x - from.x, y - from.y) < 6) return;
    const target = document.elementFromPoint(x, y)?.closest("[data-sort-id]");
    if (target && target.parentElement === ref.current?.parentElement) {
      suppressClick.current = true;
      onMove?.(target.getAttribute("data-sort-id")!);
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
  }
  useEffect(() => {
    const row = ref.current;
    if (!row || !enabled) return;
    const begin = (e: TouchEvent) => {
      if (interactive(e.target) || e.touches.length !== 1) return;
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY, time: Date.now() };
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
          start.current = null;
        return;
      }
      e.preventDefault();
    };
    const end = (e: TouchEvent) => {
      if (!start.current) return;
      if (Date.now() - start.current.time >= 250) {
        e.preventDefault();
        finish(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      } else start.current = null;
    };
    const cancel = () => {
      start.current = null;
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
      }}
      onPointerMove={(e) => {
        const from = start.current;
        if (
          e.pointerType !== "touch" &&
          from &&
          Math.hypot(e.clientX - from.x, e.clientY - from.y) >= 6
        )
          e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={(e) => {
        if (e.pointerType !== "touch") finish(e.clientX, e.clientY);
      }}
      onPointerCancel={(e) => {
        if (e.pointerType !== "touch") start.current = null;
      }}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.preventDefault();
          e.stopPropagation();
          suppressClick.current = false;
        }
      }}
      onKeyDown={(e) => {
        if (!enabled || interactive(e.target)) return;
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
