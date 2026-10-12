import localized from "../locales/zh.json" with { type: "json" };
import React, { useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "./button.js";
export function Modal({
  children,
  onClose,
  ...props
}: {
  children: React.ReactNode;
  onClose: () => void;
  "aria-label": string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      {...props}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
// Promise-based replacement for window.confirm, styled like every other Modal.
export function ask(message: string, confirmLabel: string): Promise<boolean> {
  const trigger = document.activeElement as HTMLElement | null;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      root.unmount();
      host.remove();
      trigger?.focus();
      resolve(ok);
    };
    root.render(
      <Modal aria-label={message} onClose={() => done(false)}>
        <p className="confirm-message">{message}</p>
        <div className="form-actions">
          <Button autoFocus variant="danger" onClick={() => done(true)}>
            {confirmLabel}
          </Button>
          <Button onClick={() => done(false)}>{localized["Cancel"]}</Button>
        </div>
      </Modal>,
    );
  });
}
