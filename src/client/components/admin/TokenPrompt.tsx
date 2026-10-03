import { type FormEvent, useId, useState } from "react";
import { Button } from "../Button";
import { Panel } from "../Panel";

/** Self-host token mode (spec 7.4): asks for ADMIN_TOKEN, which is kept for this tab session only. */
export function TokenPrompt({
  rejected,
  onSubmit,
}: {
  rejected: boolean;
  onSubmit: (token: string) => void;
}) {
  const inputId = useId();
  const [value, setValue] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };

  return (
    <Panel label="sign in" className="mt-8 px-4 pt-5 pb-4">
      <form onSubmit={submit} className="text-xs">
        <label htmlFor={inputId} className="text-muted">
          admin token
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            id={inputId}
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="current-password"
            aria-invalid={rejected}
            aria-describedby={`${inputId}-hint`}
            className="min-w-0 flex-1 rounded border border-line bg-transparent px-3 py-1.5 text-ink outline-none focus:border-accent"
          />
          <Button type="submit" variant="primary" disabled={value.trim() === ""}>
            sign in
          </Button>
        </div>
        <p id={`${inputId}-hint`} className={`mt-2 ${rejected ? "text-danger" : "text-faint"}`}>
          {rejected
            ? "that token was rejected"
            : "kept in this tab only, cleared when you sign out or close it"}
        </p>
      </form>
    </Panel>
  );
}
