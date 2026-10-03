import type { PickedFile } from "../../lib/create";
import { formatBytes } from "../../lib/format";
import { Button } from "../Button";

/** The attached file, shown in place of the textarea: a file paste carries no text. */
export function FileCard({
  file,
  onRemove,
  disabled,
}: {
  file: PickedFile;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex min-h-72 flex-col items-start justify-center gap-3 px-4 py-6 text-sm">
      <p className="text-faint text-xs">attached file</p>
      <p className="break-all text-ink">{file.name}</p>
      <p className="text-muted text-xs">
        {formatBytes(file.bytes.length)} · {file.mime}
      </p>
      <Button onClick={onRemove} disabled={disabled} aria-label={`Remove ${file.name}`}>
        remove file
      </Button>
    </div>
  );
}
