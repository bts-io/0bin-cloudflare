import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Page frame: gradient hairline, wordmark, a right-hand nav slot and a narrow mono column. `homeLink` false
 * keeps the wordmark as plain text, for viewers who cannot use the create page it would lead to.
 */
export function Shell({
  nav,
  homeLink = true,
  children,
}: {
  nav?: ReactNode;
  homeLink?: boolean;
  children: ReactNode;
}) {
  const wordmark = "text-grad text-3xl font-extrabold tracking-tight";
  return (
    <>
      <div className="bg-grad h-0.5" />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <header className="flex items-center justify-between gap-4">
          {homeLink ? (
            <Link to="/" className={wordmark}>
              0bin
            </Link>
          ) : (
            <span className={wordmark}>0bin</span>
          )}
          <nav className="flex items-center gap-4 text-xs text-muted">{nav}</nav>
        </header>
        {children}
      </main>
    </>
  );
}
