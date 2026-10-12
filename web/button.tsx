import React from "react";

export function Button({
  variant = "secondary",
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "icon";
}) {
  return (
    <button
      {...props}
      type={type}
      className={`button ${variant === "icon" ? "icon-button" : variant} ${className}`.trim()}
    />
  );
}
