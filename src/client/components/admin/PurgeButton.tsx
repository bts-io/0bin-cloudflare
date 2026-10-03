import { useState } from "react";
import { Button } from "../Button";

/** "Purge expired now": runs the cron purge on demand and shows how many rows it removed. */
export function PurgeButton({ onPurge }: { onPurge: () => Promise<number | null> }) {
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState<number | null>(null);

  const purge = async () => {
    setBusy(true);
    try {
      setDeleted(await onPurge());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <Button onClick={purge} disabled={busy}>
        {busy ? "purging" : "purge expired now"}
      </Button>
      {deleted !== null && (
        <span className="text-muted">
          purged {deleted} expired {deleted === 1 ? "paste" : "pastes"}
        </span>
      )}
    </div>
  );
}
