import { useState } from "react";
import { type AdminPasteItem, ageText, expiresText, type PasteState } from "../../lib/admin";
import { formatBytes } from "../../lib/format";
import { Button } from "../Button";
import { Panel } from "../Panel";
import { ConfirmBar } from "./ConfirmBar";

const STATES: readonly PasteState[] = ["active", "expired"];
const CELL = "px-3 py-2 whitespace-nowrap";

/** Paste rows with an active / expired toggle, per-row inline delete confirm and "load more". */
export function PasteTable({
  state,
  onStateChange,
  items,
  hasMore,
  loading,
  onLoadMore,
  onDelete,
}: {
  state: PasteState;
  onStateChange: (state: PasteState) => void;
  items: AdminPasteItem[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = Date.now();

  const confirm = async (id: string) => {
    setBusy(true);
    try {
      await onDelete(id);
    } finally {
      setBusy(false);
      setArmed(null);
    }
  };

  return (
    <Panel label="pastes" className="mt-8 px-4 pt-5 pb-4">
      <fieldset className="flex items-center gap-2 text-xs">
        <legend className="sr-only">paste state</legend>
        {STATES.map((s) => (
          <Button
            key={s}
            aria-pressed={state === s}
            onClick={() => onStateChange(s)}
            className={state === s ? "border-accent text-accent" : ""}
          >
            {s}
          </Button>
        ))}
      </fieldset>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">{state} pastes, newest first</caption>
          <thead className="text-muted">
            <tr className="border-b border-line">
              {["id", "kind", "size", "burn", "created", "expires"].map((h) => (
                <th key={h} scope="col" className={`${CELL} font-normal`}>
                  {h}
                </th>
              ))}
              <th scope="col" className={CELL}>
                <span className="sr-only">actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-line/60">
                <td className={`${CELL} text-ink`}>{p.id}</td>
                <td className={CELL}>{p.kind}</td>
                <td className={CELL}>{formatBytes(p.size)}</td>
                <td className={`${CELL} ${p.burn ? "text-warn" : "text-faint"}`}>{p.burn ? "burn" : "-"}</td>
                <td className={CELL} title={new Date(p.createdAt).toISOString()}>
                  {ageText(p.createdAt, now)}
                </td>
                <td className={CELL}>{expiresText(p.expiresAt, now)}</td>
                <td className={`${CELL} text-right`}>
                  {armed === p.id ? (
                    <ConfirmBar
                      id={p.id}
                      busy={busy}
                      onConfirm={() => confirm(p.id)}
                      onCancel={() => setArmed(null)}
                    />
                  ) : (
                    <Button variant="danger" onClick={() => setArmed(p.id)} aria-label={`Delete ${p.id}`}>
                      delete
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length === 0 && !loading && <p className="mt-4 text-xs text-muted">no {state} pastes</p>}
      {loading && <p className="mt-4 text-xs text-muted">loading pastes</p>}
      {hasMore && !loading && (
        <Button className="mt-4" onClick={onLoadMore}>
          load more
        </Button>
      )}
    </Panel>
  );
}
