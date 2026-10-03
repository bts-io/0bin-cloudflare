import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { buildCreateRequest, type Expiry, encryptPaste, HEADER_LIMITS } from "../../../shared/crypto";
import { ApiError, createPaste } from "../../lib/api";
import { CLONE_KEY } from "../../lib/clone";
import {
  canSubmit,
  createErrorMessage,
  DEFAULT_EXPIRY,
  EXPIRY_OPTIONS,
  expiryForBurn,
  fitsLimit,
  MAX_FILE_BYTES,
  type PickedFile,
  parseClonePrefill,
  readPickedFile,
  TOO_LARGE_MESSAGE,
  toPasteInput,
} from "../../lib/create";
import { formatBytes } from "../../lib/format";
import { addHistory } from "../../lib/history";
import { LANGUAGES } from "../../lib/languages";
import { clearTeamKey, getTeamKey, setTeamKey } from "../../lib/team-key";
import { Button } from "../Button";
import { Panel } from "../Panel";
import { FileCard } from "./FileCard";
import { TeamKeyPrompt } from "./TeamKeyPrompt";

const PILL =
  "flex items-center gap-1.5 rounded border border-line px-3 py-1.5 focus-within:border-accent has-disabled:opacity-50";
const SELECT = "bg-surface text-body outline-none";

type Busy = "reading" | "encrypting" | "sending" | null;
const BUSY_TEXT = { reading: "reading file...", encrypting: "encrypting...", sending: "sending..." } as const;

/** The new-paste form (spec 8.1). Everything browser-only (storage, clipboard, crypto) runs in effects or handlers. */
export function CreateForm() {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [lang, setLang] = useState("auto");
  const [expiry, setExpiry] = useState<Expiry>(DEFAULT_EXPIRY);
  const [burn, setBurn] = useState(false);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  // Team-key mode: null = not asked, "ask" = first 401, "rejected" = a saved key was refused.
  const [keyPrompt, setKeyPrompt] = useState<"ask" | "rejected" | null>(null);
  const [dragging, setDragging] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  const busyRef = useRef(false);
  busyRef.current = busy !== null;

  const attach = async (picked: File, fromClipboard = false) => {
    if (busyRef.current) return;
    if (picked.size > MAX_FILE_BYTES) {
      setError(`That file is too large (${formatBytes(picked.size)}). ${TOO_LARGE_MESSAGE}`);
      return;
    }
    setError(null);
    setBusy("reading");
    try {
      setFile(await readPickedFile(picked, fromClipboard));
    } catch {
      setError("That file could not be read.");
    } finally {
      setBusy(null);
    }
  };

  // Clone prefill: read once, then clear so a reload starts empty.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(CLONE_KEY);
      sessionStorage.removeItem(CLONE_KEY);
    } catch {
      return;
    }
    const prefill = parseClonePrefill(raw);
    if (!prefill) return;
    setText(prefill.text);
    setTitle(prefill.title);
    setLang(prefill.lang);
  }, []);

  // Drag-drop anywhere on the page, and files (screenshots) pasted from the clipboard.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer?.files[0];
      if (dropped) void attach(dropped);
    };
    const onPaste = (e: ClipboardEvent) => {
      const pasted = e.clipboardData?.files[0];
      if (!pasted) return;
      e.preventDefault();
      void attach(pasted, true);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  const onBurn = (checked: boolean) => {
    setBurn(checked);
    setExpiry((current) => expiryForBurn(current, checked));
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !canSubmit({ text, file })) return;
    setError(null);
    setBusy("encrypting");
    try {
      const input = toPasteInput({ text, title, lang, file });
      const paste = await encryptPaste(input);
      if (!fitsLimit(paste.ciphertext)) {
        setError(TOO_LARGE_MESSAGE);
        setBusy(null);
        return;
      }
      const request = buildCreateRequest(paste, { expiry, burn });
      setBusy("sending");
      const created = await createPaste(request);
      addHistory({
        id: created.id,
        ikm: paste.ikm,
        ownerToken: created.ownerToken,
        createdAt: created.createdAt,
        expiresAt: created.expiresAt,
        burn: created.burn,
        kind: paste.kind,
        label: input.title,
      });
      // Busy stays on while the browser leaves the page.
      location.replace(`/p/${created.id}#${paste.ikm}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const hadKey = getTeamKey() !== null;
        clearTeamKey();
        setKeyPrompt(hadKey ? "rejected" : "ask");
      }
      setError(createErrorMessage(err));
      setBusy(null);
    }
  };

  const saveKey = (key: string) => {
    setTeamKey(key);
    setKeyPrompt(null);
    setError(null);
    formRef.current?.requestSubmit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const locked = busy !== null;

  return (
    <>
      {keyPrompt && <TeamKeyPrompt rejected={keyPrompt === "rejected"} onSave={saveKey} />}
      <form ref={formRef} onSubmit={submit} onKeyDown={onKeyDown} aria-busy={locked}>
        <Panel
          label="new paste"
          className={`mt-6 focus-within:border-accent ${dragging ? "border-accent border-dashed" : ""}`}
        >
          <label htmlFor={`${ids}-title`} className="sr-only">
            title (optional, encrypted)
          </label>
          <input
            id={`${ids}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={HEADER_LIMITS.title}
            disabled={locked}
            placeholder="title (optional, encrypted)"
            autoComplete="off"
            className="w-full border-b border-line bg-transparent px-4 pt-4 pb-3 text-sm text-ink outline-none placeholder:text-faint"
          />
          {file ? (
            <FileCard file={file} onRemove={removeFile} disabled={locked} />
          ) : (
            <>
              <label htmlFor={`${ids}-text`} className="sr-only">
                paste text
              </label>
              <textarea
                id={`${ids}-text`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={locked}
                placeholder={dragging ? "drop the file to attach it" : "paste text, or drop / paste a file"}
                spellCheck={false}
                autoComplete="off"
                className="field-sizing-content block min-h-72 w-full resize-y bg-transparent px-4 py-3 text-sm text-ink outline-none placeholder:text-faint"
              />
            </>
          )}
        </Panel>

        <Panel label="options" tone="accent-2" className="mt-5 px-4 py-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) void attach(picked);
              }}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={locked}
              className="focus-visible:outline-2 focus-visible:outline-accent"
            >
              {file ? "replace file" : "attach file"}
            </Button>
            <label className={PILL}>
              <span className="text-muted">lang:</span>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                disabled={locked || file !== null}
                className={SELECT}
              >
                {LANGUAGES.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className={PILL}>
              <span className="text-muted">expires:</span>
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value as Expiry)}
                disabled={locked}
                className={SELECT}
              >
                {EXPIRY_OPTIONS.map(([value, name]) => (
                  <option key={value} value={value} disabled={burn && value === "never"}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 rounded px-1 py-1.5 has-focus-visible:outline-2 has-focus-visible:outline-accent">
              <input
                type="checkbox"
                checked={burn}
                onChange={(e) => onBurn(e.target.checked)}
                disabled={locked}
                className="accent-accent outline-none"
              />
              burn after reading
            </label>
            <span className="ml-auto text-faint" aria-hidden="true">
              ctrl+enter
            </span>
            <Button
              type="submit"
              variant="primary"
              disabled={locked || !canSubmit({ text, file })}
              aria-keyshortcuts="Control+Enter Meta+Enter"
              className="px-5 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {busy === "encrypting" || busy === "sending" ? BUSY_TEXT[busy] : "encrypt + share"}
            </Button>
          </div>
        </Panel>

        <p aria-live="polite" className="sr-only">
          {busy ? BUSY_TEXT[busy] : ""}
        </p>
        <p role="alert" className="mt-4 text-sm text-danger empty:hidden">
          {error}
        </p>
      </form>
    </>
  );
}
