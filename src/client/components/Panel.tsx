import type { ReactNode } from "react";

/** Boxed section with its label set into the top border, like a terminal UI frame. */
export function Panel({
  label,
  tone = "accent",
  className = "",
  children,
}: {
  label: ReactNode;
  tone?: "accent" | "accent-2";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`relative rounded border border-line bg-surface ${className}`}>
      <div
        className={`absolute -top-2.5 left-4 bg-page px-2 text-xs ${tone === "accent" ? "text-accent" : "text-accent-2"}`}
      >
        {label}
      </div>
      {children}
    </section>
  );
}
