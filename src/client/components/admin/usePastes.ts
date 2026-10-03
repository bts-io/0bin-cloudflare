import { useCallback, useEffect, useState } from "react";
import { type AdminPasteItem, listPastes, type PasteState } from "../../lib/admin";

/**
 * The admin paste list: the first page loads whenever the state filter, the token or the reload counter
 * changes, and `loadMore` follows `nextCursor`. Failures go to `onError`, which owns the auth handling.
 */
export function usePastes(token: string | null, enabled: boolean, onError: (err: unknown) => void) {
  const [state, setState] = useState<PasteState>("active");
  const [items, setItems] = useState<AdminPasteItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setItems([]);
    setCursor(null);
    setLoading(true);
    listPastes(token, { state })
      .then((page) => {
        if (!live) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      })
      .catch((err) => {
        if (live) onError(err);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [token, enabled, state, reloads]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const page = await listPastes(token, { state, cursor });
      setItems((prev) => [...prev, ...page.items.filter((p) => !prev.some((q) => q.id === p.id))]);
      setCursor(page.nextCursor);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  };

  const remove = useCallback((id: string) => setItems((prev) => prev.filter((p) => p.id !== id)), []);
  const reload = useCallback(() => setReloads((n) => n + 1), []);

  return { state, setState, items, hasMore: cursor !== null, loading, loadMore, remove, reload };
}
