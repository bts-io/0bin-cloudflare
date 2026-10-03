/**
 * "My pastes": what this browser created, kept in localStorage (docs/spec.md 6.4). It holds link keys and owner
 * tokens, so it never leaves the browser. Every storage access is guarded: without storage the app still works,
 * it just cannot offer Delete or the list.
 */
import { z } from "zod";
import { Id, Kind, Token } from "../../shared/schemas/paste";

const KEY = "0bin-cf:history:v1";
const CAP = 50;

export const HistoryItem = z.object({
  id: Id,
  ikm: Token,
  ownerToken: Token,
  createdAt: z.number().int(),
  expiresAt: z.number().int().nullable(),
  burn: z.boolean(),
  kind: Kind,
  label: z.string().max(100).optional(),
});
export type HistoryItem = z.infer<typeof HistoryItem>;

const Stored = z.object({ v: z.literal(1), items: z.array(HistoryItem) });

function read(): HistoryItem[] {
  try {
    const parsed = Stored.safeParse(JSON.parse(localStorage.getItem(KEY) ?? "null"));
    return parsed.success ? parsed.data.items : [];
  } catch {
    return [];
  }
}

function write(items: HistoryItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, items }));
  } catch {
    // Storage full or blocked: the paste still exists, only the local list misses it.
  }
}

/** Newest first, expired entries dropped (and the pruned list saved back). */
export function listHistory(now = Date.now()): HistoryItem[] {
  const all = read();
  const live = all.filter((item) => item.expiresAt === null || item.expiresAt > now);
  if (live.length !== all.length) write(live);
  return live;
}

export function addHistory(item: HistoryItem): void {
  write([item, ...read().filter((i) => i.id !== item.id)].slice(0, CAP));
}

export const findHistory = (id: string) => read().find((i) => i.id === id);

/** Called on owner delete, on "Forget", and when the server answers 404 for this id. */
export function forgetHistory(id: string): void {
  write(read().filter((i) => i.id !== id));
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored or storage blocked: already clear.
  }
}
