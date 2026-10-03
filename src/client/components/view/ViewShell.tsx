import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Shell } from "../Shell";
import { FOCUS } from "./Message";
import { useCanCreate } from "./useCanCreate";

/** Shell for view and not-found pages: links to the create page only for people who can create. */
export function ViewShell({ children }: { children: ReactNode }) {
  const canCreate = useCanCreate();
  return (
    <Shell
      homeLink={canCreate}
      nav={
        canCreate && (
          <Link to="/" className={`hover:text-ink ${FOCUS}`}>
            new paste
          </Link>
        )
      }
    >
      {children}
    </Shell>
  );
}
