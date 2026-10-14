import React, { useEffect } from "react";

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

// Inline row actions; one shared wrapper for every list and editor row.
export function ActionTools({ children }: { children: React.ReactNode }) {
  return <div className="action-tools">{children}</div>;
}
