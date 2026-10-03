import { type FormEvent, useId, useState } from "react";
import { Button } from "../Button";
import { Panel } from "../Panel";

/** Asked for once when the server answers 401 in team-key mode; the form resubmits after it is saved. */
export function TeamKeyPrompt({ rejected, onSave }: { rejected: boolean; onSave: (key: string) => void }) {
  const [value, setValue] = useState("");
  const id = useId();

  const save = (e: FormEvent) => {
    e.preventDefault();
    const key = value.trim();
    if (key) onSave(key);
  };

  return (
    <Panel label="team key" tone="accent-2" className="mt-6 px-4 pt-5 pb-4">
      <form onSubmit={save} className="flex flex-wrap items-center gap-3 text-xs">
        <label htmlFor={id} className="text-muted">
          {rejected
            ? "that key was not accepted. try again:"
            : "this server needs the team key to create pastes:"}
        </label>
        <input
          id={id}
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-48 flex-1 rounded border border-line bg-transparent px-3 py-1.5 text-ink outline-none focus:border-accent"
        />
        <Button type="submit" variant="primary" disabled={!value.trim()}>
          save and retry
        </Button>
      </form>
    </Panel>
  );
}
