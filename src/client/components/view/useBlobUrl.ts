import { useEffect, useState } from "react";

/**
 * A Blob URL for `data` that lives exactly as long as the component: created after mount (never during SSR) and
 * revoked on unmount or when the data changes. Null while not created or when `data` is null.
 */
export function useBlobUrl(data: Uint8Array | string | null, type: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (data === null) return;
    // The copy gives Blob an ArrayBuffer-backed view, which its typings require.
    const part = typeof data === "string" ? data : new Uint8Array(data);
    const created = URL.createObjectURL(new Blob([part], { type }));
    setUrl(created);
    return () => {
      URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [data, type]);
  return url;
}
