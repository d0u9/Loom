import React, { useEffect, useRef } from "react";
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
  useEffect(() => {
    ref.current?.showModal();
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
