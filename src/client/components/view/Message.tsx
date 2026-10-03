import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Panel } from "../Panel";

/** Visible keyboard focus for the view page's own buttons and links. */
export const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const newPasteNav = (
  <Link to="/" className={`hover:text-ink ${FOCUS}`}>
    new paste
  </Link>
);

/** One boxed message: loading, missing key, wrong key, not found. `alert` announces failures right away. */
export function Message({
  label,
  role = "status",
  children,
}: {
  label: string;
  role?: "status" | "alert";
  children: ReactNode;
}) {
  return (
    <Panel label={label} className="mt-6 px-4 pt-5 pb-4 text-sm">
      <div role={role} className="space-y-3">
        {children}
      </div>
    </Panel>
  );
}
