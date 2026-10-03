import { useEffect, useRef } from "react";
import { Button } from "../Button";

/** Inline "delete <id>?" confirmation; focus lands on cancel so a stray Enter never deletes. */
export function ConfirmBar({
  id,
  busy,
  onConfirm,
  onCancel,
}: {
  id: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  useEffect(() => (rootRef.current?.lastElementChild as HTMLButtonElement | null)?.focus(), []);

  return (
    <span ref={rootRef} className="inline-flex flex-wrap items-center gap-2">
      <span className="text-danger">delete {id}?</span>
      <Button variant="danger" disabled={busy} onClick={onConfirm} aria-label={`Confirm delete ${id}`}>
        {busy ? "deleting" : "yes, delete"}
      </Button>
      <Button disabled={busy} onClick={onCancel}>
        cancel
      </Button>
    </span>
  );
}
