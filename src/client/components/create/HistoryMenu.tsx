import { useEffect, useId, useRef, useState } from "react";
import { expiryLabel } from "../../lib/create";
import { clearHistory, forgetHistory, type HistoryItem, listHistory } from "../../lib/history";
import { Button } from "../Button";

const FOCUS = "rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * "my pastes [n]": a disclosure menu over the local history (spec 6.4). History is read only after mount, so the
 * server renders an empty count and never touches storage.
 */
export function HistoryMenu() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => setItems(listHistory()), []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) setItems(listHistory());
    setOpen(!open);
  };

  const forget = (id: string) => {
    forgetHistory(id);
    setItems(listHistory());
  };

  const clear = () => {
    if (!window.confirm("Clear history? It holds the only copy of these links' keys in this browser."))
      return;
    clearHistory();
    setItems([]);
    buttonRef.current?.focus();
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={`hover:text-ink ${FOCUS}`}
      >
        my pastes [{items.length}]
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-10 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded border border-line bg-surface p-2 text-xs shadow-lg"
        >
          {items.length === 0 ? (
            <p className="px-2 py-1 text-muted">no pastes from this browser yet</p>
          ) : (
            <>
              <ul className="max-h-80 overflow-y-auto">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 px-2 py-1.5">
                    <a
                      href={`/p/${item.id}#${item.ikm}`}
                      className={`min-w-0 flex-1 hover:text-ink ${FOCUS}`}
                    >
                      <span className="block truncate text-body">{item.label || item.id}</span>
                      <span className="block text-faint">
                        {item.kind}
                        {item.burn && " · burn"} · {expiryLabel(item.expiresAt)}
                      </span>
                    </a>
                    <button
                      type="button"
                      onClick={() => forget(item.id)}
                      aria-label={`Forget ${item.label || item.id}`}
                      className={`text-muted hover:text-danger ${FOCUS}`}
                    >
                      forget
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 border-t border-line px-2 pt-2">
                <Button variant="danger" onClick={clear}>
                  clear history
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
