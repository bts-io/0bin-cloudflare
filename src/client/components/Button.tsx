import type { ButtonHTMLAttributes } from "react";

const VARIANTS = {
  default: "border border-line text-body hover:border-accent hover:text-ink",
  primary: "bg-grad font-semibold text-black hover:brightness-110",
  danger: "border border-danger/50 text-danger hover:bg-danger/10",
} as const;

/** The one button style family: outlined by default, gradient for the main action, red for destructive ones. */
export function Button({
  variant = "default",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }) {
  return (
    <button
      type={type}
      className={`rounded px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
