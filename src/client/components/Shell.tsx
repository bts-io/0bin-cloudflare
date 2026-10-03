import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Page frame: gradient hairline, wordmark, a right-hand nav slot and a narrow mono column. */
export function Shell({ nav, children }: { nav?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="bg-grad h-0.5" />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <header className="flex items-center justify-between gap-4">
          <Link to="/" className="text-grad text-3xl font-extrabold tracking-tight">
            0bin
          </Link>
          <nav className="flex items-center gap-4 text-xs text-muted">{nav}</nav>
        </header>
        {children}
      </main>
    </>
  );
}
