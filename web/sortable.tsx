import React, { useEffect, useRef } from "react";

export function SortableRow({
  id,
  disabled,
  onMove,
  onStep,
  drop,
  onNest,
  dragLabel,
  as: Tag = "article",
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  id?: string;
  disabled?: boolean;
  /** `after` is true when the row lands after the target (moving down). */
  onMove?: (target: string, after: boolean) => void;
  onStep?: (direction: number) => void;
  dragLabel?: string;
  as?: "article" | "div";
  drop?: { selector: string; onDrop: (target: HTMLElement) => void };
  /** Dropping on the lower half of a same-group row marked data-nest nests into it. */
  onNest?: (target: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const start = useRef<{ x: number; y: number; time: number } | null>(null);
  const suppressClick = useRef(false);
  const hovered = useRef<HTMLElement | null>(null);
  const slot = useRef<HTMLElement | null>(null);
  const grab = useRef({ x: 0, y: 0 });
  const preview = useRef<HTMLDivElement | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabled = !!(onMove || drop) && !disabled;
  // Sibling row under the pointer that accepts this row, if any.
  function sortTarget(x: number, y: number) {
    const target = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-sort-id]");
    return target &&
      target !== ref.current &&
      target.parentElement === ref.current?.parentElement
      ? target
      : null;
  }
  // Where a drop at (x, y) lands: lower half of a data-nest row nests into
  // it; otherwise moving down lands after the target, moving up before it.
  function landing(x: number, y: number) {
    const target = sortTarget(x, y);
    if (!target) return null;
    const box = target.getBoundingClientRect();
    const place =
      onNest &&
      target.dataset.nest !== undefined &&
      y > box.top + box.height / 2
        ? "into"
        : ref.current!.compareDocumentPosition(target) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ? "after"
          : "before";
    return { target, place };
  }
  function hover(x: number, y: number) {
    const target = drop
      ? (document.elementFromPoint(x, y)?.closest<HTMLElement>(drop.selector) ??
        null)
      : null;
    hovered.current?.classList.remove("drop-hover");
    hovered.current = target;
    target?.classList.add("drop-hover");
    slot.current?.classList.remove("drop-before", "drop-after");
    const land = onMove && !target ? landing(x, y) : null;
    slot.current = land?.target ?? null;
    if (land?.place === "into") {
      hovered.current = land.target;
      land.target.classList.add("drop-hover");
    } else land?.target.classList.add("drop-" + land.place);
  }
  function clearHover() {
    hovered.current?.classList.remove("drop-hover");
    hovered.current = null;
    slot.current?.classList.remove("drop-before", "drop-after");
    slot.current = null;
  }
  function lift(x: number, y: number) {
    if (!preview.current && ref.current) {
      // The preview is a copy of the row so it is clear what is moving.
      const row = ref.current.getBoundingClientRect();
      const ghost = ref.current.cloneNode(true) as HTMLDivElement;
      ghost.removeAttribute("data-sort-id");
      ghost.removeAttribute("id");
      ghost.classList.add("drag-preview");
      ghost.setAttribute("aria-hidden", "true");
      ghost.style.width = row.width + "px";
      ghost.title = dragLabel || "";
      grab.current = { x: x - row.left, y: y - row.top };
      document.body.appendChild(ghost);
      preview.current = ghost;
      ref.current.classList.add("is-dragging");
      document.body.classList.add("sorting");
    }
    const ghost = preview.current!;
    ghost.style.left = `${x - grab.current.x}px`;
    ghost.style.top = `${y - grab.current.y}px`;
    hover(x, y);
  }
  function clearDrag() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    preview.current?.remove();
    preview.current = null;
    ref.current?.classList.remove("is-dragging");
    document.body.classList.remove("sorting");
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
    // Disabled fields read as text, so dragging may start on them.
    return (
      !!control &&
      !control.classList.contains("card-open") &&
      !(control as HTMLInputElement).disabled
    );
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
    const land = dropTarget ? null : landing(x, y);
    if (land?.place === "into") onNest!(land.target.dataset.sortId!);
    else if (land)
      onMove?.(land.target.dataset.sortId!, land.place === "after");
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
    <Tag
      {...props}
      ref={ref as any}
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
    </Tag>
  );
}
