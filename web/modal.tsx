import React, { useLayoutEffect, useRef } from "react";
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
