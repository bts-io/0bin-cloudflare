import type { PasteHeader } from "../../../shared/crypto";
import { formatBytes } from "../../lib/format";
import { canPreview } from "../../lib/view";
import { useBlobUrl } from "./useBlobUrl";

/** File details, plus an inline image only for the raster types in the whitelist (never SVG). */
export function FilePreview({ header, body }: { header: PasteHeader; body: Uint8Array }) {
  const previewable = canPreview(header.mime);
  const src = useBlobUrl(previewable ? body : null, header.mime ?? "");
  return (
    <div className="space-y-4 px-4 py-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted">name</dt>
        <dd className="break-all text-ink">{header.name ?? "unnamed"}</dd>
        <dt className="text-muted">type</dt>
        <dd className="break-all">{header.mime ?? "unknown"}</dd>
        <dt className="text-muted">size</dt>
        <dd>{formatBytes(body.length)}</dd>
      </dl>
      {previewable && src && (
        <img src={src} alt={header.name ?? "image preview"} className="max-h-[70vh] max-w-full rounded" />
      )}
      {!previewable && <p className="text-xs text-muted">no preview for this type. download it to open.</p>}
    </div>
  );
}
