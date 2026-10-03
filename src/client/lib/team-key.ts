/**
 * The shared team key for servers running CREATE_MODE=token: entered once, kept in this browser and sent as a
 * bearer token with create and stats. Guarded like the history: without storage the key lasts one page view.
 */
import { bearerHeaders } from "./api";

const KEY = "0bin-cf:team-key";

let memory: string | null = null;

export function getTeamKey(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function setTeamKey(value: string): void {
  memory = value;
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Blocked storage: the in-memory copy still works until the page is left.
  }
}

export function clearTeamKey(): void {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored or storage blocked: already clear.
  }
}

/** Header for create and stats; a server in another mode ignores it. */
export const teamKeyHeaders = () => bearerHeaders(getTeamKey());
