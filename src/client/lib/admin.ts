/**
 * Browser side of the admin API (docs/spec.md 5.7, 8.3): response schemas, the admin-token session store, the
 * bearer header, the paste link parser and the table labels. Everything but the fetch wrappers is pure.
 */
import type { z } from "zod";
import {
  type AdminPasteItem,
  AdminPasteList,
  AdminPurgeResult,
  AdminStats,
  type PasteState,
} from "../../shared/schemas/admin";
import { ApiError, bearerHeaders, call } from "./api";
import { expiryText, isPasteId } from "./view";

export type { AdminPasteItem, AdminStats, PasteState };

/** Self-host token mode (spec 7.4): the token lives for the tab session only. */
export const TOKEN_KEY = "0bin-cf:admin-token";

export function loadToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage blocked: the token still works for this page view, it just will not survive a reload.
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored when storage is blocked.
  }
}

const PASTE_LINK = /^(?:https?:\/\/[^/?#\s]+)?\/p\/([A-Za-z0-9_-]{12})\/?(?:\?[^#\s]*)?(?:#\S*)?$/;

/**
 * The paste id from a bare 12-char id or a `/p/<id>#...` link (absolute or path only), else null. Only the id is
 * returned: the fragment carries the key and is dropped here, so it can never reach a request.
 */
export function parsePasteRef(input: string): string | null {
  const value = input.trim();
  if (isPasteId(value)) return value;
  return value.match(PASTE_LINK)?.[1] ?? null;
}

/** "just now", "5m ago", "3h ago", "4d ago", then the UTC date once it is over a month old. */
export function ageText(createdAt: number, now = Date.now()): string {
  const minutes = Math.floor((now - createdAt) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days <= 30) return `${days}d ago`;
  return new Date(createdAt).toISOString().slice(0, 10);
}

export function expiresText(expiresAt: number | null, now = Date.now()): string {
  if (expiresAt === null) return "never";
  if (expiresAt <= now) return "expired";
  return expiryText(expiresAt, now);
}

/** How the page reacts to a failed admin call. 404 on any admin route means admin is off on this server. */
export function adminFailure(err: unknown): "token" | "forbidden" | "disabled" | "failed" {
  if (!(err instanceof ApiError)) return "failed";
  if (err.status === 401) return "token";
  if (err.status === 403) return "forbidden";
  if (err.status === 404) return "disabled";
  return "failed";
}

/** With Cloudflare Access the cookie authenticates and no header is sent; token mode adds the bearer. */
const adminCall = <T extends z.ZodType>(schema: T, path: string, token: string | null, method = "GET") =>
  call(schema, path, { method, headers: bearerHeaders(token) });

export function listPastes(
  token: string | null,
  query: { state: PasteState; cursor?: string | null; limit?: number },
) {
  const params = new URLSearchParams({ state: query.state, limit: String(query.limit ?? 50) });
  if (query.cursor) params.set("cursor", query.cursor);
  return adminCall(AdminPasteList, `/api/admin/pastes?${params}`, token);
}

export const getAdminStats = (token: string | null) => adminCall(AdminStats, "/api/admin/stats", token);

export const purgeExpired = (token: string | null) =>
  adminCall(AdminPurgeResult, "/api/admin/purge", token, "POST");

/** True when this call deleted the paste, false when it was already gone (404). */
export async function deleteAdminPaste(token: string | null, id: string): Promise<boolean> {
  const res = await fetch(`/api/admin/pastes/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: bearerHeaders(token),
  });
  if (res.status === 204) return true;
  if (res.status === 404) return false;
  throw new ApiError(res.status, "delete_failed");
}
