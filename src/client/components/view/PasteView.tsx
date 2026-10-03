import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { DecryptedPaste } from "../../../shared/crypto";
import type { PasteRead } from "../../../shared/schemas/paste";
import { deletePaste } from "../../lib/api";
import { CLONE_KEY } from "../../lib/clone";
import { forgetHistory } from "../../lib/history";
import { countLines, expiryText, languageLabel, linesLabel } from "../../lib/view";
import { Button } from "../Button";
import { Panel } from "../Panel";
import { CodeBlock } from "./CodeBlock";
import { FilePreview } from "./FilePreview";
import { FOCUS } from "./Message";
import { useBlobUrl } from "./useBlobUrl";
import { useCanCreate } from "./useCanCreate";
import { useHighlight } from "./useHighlight";

export interface OpenedPaste extends DecryptedPaste {
  read: PasteRead;
  /** Set when this browser created the paste: the view was a peek and Delete is offered. */
  ownerToken?: string;
}

const BANNER = "mt-6 rounded border px-4 py-2.5 text-xs";

/** A decrypted paste: banners, the titled panel with its meta line and actions, then the text or file. */
export function PasteView({ id, paste }: { id: string; paste: OpenedPaste }) {
  const { header, body, read, ownerToken } = paste;
  const navigate = useNavigate();
  const text = useMemo(
    () => (header.kind === "text" ? new TextDecoder().decode(body) : null),
    [header, body],
  );
  const highlighted = useHighlight(text, body.length, header.lang);
  // Downloads are always octet-stream: a Blob URL shares this page's origin, so it must never render as HTML.
  const downloadUrl = useBlobUrl(text ?? body, "application/octet-stream");
  const canCreate = useCanCreate();
  const [wrap, setWrap] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState("");

  const title = header.kind === "file" ? (header.name ?? "file") : (header.title ?? "untitled");
  const fileName = header.kind === "file" ? (header.name ?? `${id}.bin`) : `${id}.txt`;
  const lang = highlighted?.language ?? (header.lang && header.lang !== "auto" ? header.lang : "plaintext");
  const meta =
    text === null
      ? expiryText(read.expiresAt)
      : `${languageLabel(lang)} · ${linesLabel(countLines(text))} · ${expiryText(read.expiresAt)}`;

  const copy = async (value: string, done: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(done);
    } catch {
      setStatus("copy failed: your browser blocked the clipboard");
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title, url: window.location.href });
    } catch {
      // Dismissing the share sheet rejects too; nothing to report.
    }
  };

  const download = () => {
    if (!downloadUrl) return;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    a.click();
  };

  const clone = () => {
    try {
      sessionStorage.setItem(CLONE_KEY, JSON.stringify({ text, title: header.title, lang: header.lang }));
    } catch {
      setStatus("clone failed: session storage is blocked");
      return;
    }
    navigate({ to: "/" });
  };

  const remove = async () => {
    if (!ownerToken) return;
    try {
      await deletePaste(id, ownerToken);
    } catch {
      setConfirmDelete(false);
      setStatus("delete failed: try again");
      return;
    }
    forgetHistory(id);
    navigate({ to: "/" });
  };

  return (
    <>
      {read.burned && (
        <p role="alert" className={`${BANNER} border-warn/40 bg-warn/10 text-warn`}>
          burned: this paste is gone from the server. copy what you need now.
        </p>
      )}
      {ownerToken && read.burn && (
        <p className={`${BANNER} border-accent-2/40 bg-accent-2/10 text-accent-2`}>
          you created this burn-after-reading paste. your view does not destroy it. the first person you share
          the link with will.
        </p>
      )}
      <Panel label={<h1 className="max-w-[60vw] truncate font-normal">{title}</h1>} className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 pt-4 pb-3 text-xs text-muted">
          <span>{meta}</span>
          <span className="flex flex-wrap gap-2">
            {text !== null && (
              <>
                <Button className={FOCUS} onClick={() => copy(text, "text copied")}>
                  copy text
                </Button>
                <Button className={FOCUS} aria-pressed={wrap} onClick={() => setWrap(!wrap)}>
                  wrap
                </Button>
              </>
            )}
            <Button className={FOCUS} onClick={() => copy(window.location.href, "link copied")}>
              copy link
            </Button>
            {typeof navigator.share === "function" && (
              <Button className={FOCUS} onClick={share}>
                share
              </Button>
            )}
            <Button className={FOCUS} disabled={!downloadUrl} onClick={download}>
              download
            </Button>
            {text !== null && canCreate && (
              <Button className={FOCUS} onClick={clone}>
                clone
              </Button>
            )}
            {ownerToken && !confirmDelete && (
              <Button variant="danger" className={FOCUS} onClick={() => setConfirmDelete(true)}>
                delete
              </Button>
            )}
            {ownerToken && confirmDelete && (
              <>
                <Button variant="danger" className={FOCUS} onClick={remove}>
                  really delete?
                </Button>
                <Button className={FOCUS} onClick={() => setConfirmDelete(false)}>
                  cancel
                </Button>
              </>
            )}
          </span>
        </div>
        {text === null ? (
          <FilePreview header={header} body={body} />
        ) : (
          <CodeBlock text={text} html={highlighted?.html ?? null} wrap={wrap} />
        )}
      </Panel>
      <p role="status" className="mt-4 min-h-4 text-xs text-accent">
        {status}
      </p>
      <p className="mt-1 text-xs text-faint">decrypted locally with the key from the link</p>
    </>
  );
}
