import { type FormEvent, useId, useState } from "react";
import { parsePasteRef } from "../../lib/admin";
import { Button } from "../Button";
import { ConfirmBar } from "./ConfirmBar";

/**
 * "Delete by URL or id" (0bin parity). The link is parsed in the browser and only the id is ever sent: the
 * fragment with the key never leaves this input.
 */
export function DeleteByRef({ onDelete }: { onDelete: (id: string) => Promise<void> }) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = parsePasteRef(value);
    setInvalid(id === null);
    setPending(id);
  };

  const confirm = async (id: string) => {
    setBusy(true);
    try {
      await onDelete(id);
      setValue("");
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <form onSubmit={submit} className="text-xs" autoComplete="off">
      <label htmlFor={inputId} className="text-muted">
        delete by url or id
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          id={inputId}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
            setPending(null);
          }}
          placeholder="https://.../p/abcdefghijkl#... or abcdefghijkl"
          spellCheck={false}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${inputId}-error` : undefined}
          className="min-w-0 flex-1 rounded border border-line bg-transparent px-3 py-1.5 text-ink outline-none placeholder:text-faint focus:border-accent"
        />
        {pending ? (
          <ConfirmBar
            id={pending}
            busy={busy}
            onConfirm={() => confirm(pending)}
            onCancel={() => setPending(null)}
          />
        ) : (
          <Button type="submit" variant="danger" disabled={value.trim() === ""}>
            delete
          </Button>
        )}
      </div>
      {invalid && (
        <p id={`${inputId}-error`} className="mt-2 text-danger">
          not a paste link or a 12-character id
        </p>
      )}
    </form>
  );
}
