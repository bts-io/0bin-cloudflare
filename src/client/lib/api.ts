/**
 * Browser side of the paste API (docs/spec.md section 5). Every response is parsed with the shared Zod schemas,
 * and every failure becomes an ApiError carrying the status and the server's error code.
 */
import type { z } from "zod";
import { PublicConfig } from "../../shared/schemas/config";
import { type CreatePasteBody, CreatePasteResponse, PasteMeta, PasteRead } from "../../shared/schemas/paste";
import { Stats } from "../../shared/schemas/stats";
import { teamKeyHeaders } from "./team-key";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

export async function call<T extends z.ZodType>(
  schema: T,
  path: string,
  init?: RequestInit,
): Promise<z.infer<T>> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? "unknown");
  }
  return schema.parse(await res.json());
}

/** `Authorization: Bearer` for team-key and admin-token servers; no header when there is no token. */
export const bearerHeaders = (token: string | null): Record<string, string> =>
  token ? { authorization: `Bearer ${token}` } : {};

/** Read and owner tokens travel as headers, never in the URL, so they stay out of logs. */
const tokenHeaders = (t: { readToken?: string; ownerToken?: string }) => ({
  ...(t.readToken && { "x-read-token": t.readToken }),
  ...(t.ownerToken && { "x-owner-token": t.ownerToken }),
});

/** The Turnstile token travels as a header, so the paste body schema stays strict. */
export const turnstileHeaders = (token: string | null): Record<string, string> =>
  token ? { "x-turnstile-token": token } : {};

export const createPaste = (body: CreatePasteBody, turnstileToken: string | null) =>
  call(CreatePasteResponse, "/api/pastes", {
    method: "POST",
    headers: { "content-type": "application/json", ...teamKeyHeaders(), ...turnstileHeaders(turnstileToken) },
    body: JSON.stringify(body),
  });

export const getMeta = (id: string, readToken: string) =>
  call(PasteMeta, `/api/pastes/${id}/meta`, { headers: tokenHeaders({ readToken }) });

/** Destroys a burn paste unless `ownerToken` is given (the creator's peek never burns). */
export const getPaste = (id: string, tokens: { readToken?: string; ownerToken?: string }) =>
  call(PasteRead, `/api/pastes/${id}`, { headers: tokenHeaders(tokens) });

export async function deletePaste(id: string, ownerToken: string): Promise<void> {
  const res = await fetch(`/api/pastes/${id}`, { method: "DELETE", headers: tokenHeaders({ ownerToken }) });
  if (res.status !== 204) throw new ApiError(res.status, "delete_failed");
}

export const getConfig = () => call(PublicConfig, "/api/config");

export const getStats = () => call(Stats, "/api/stats", { headers: teamKeyHeaders() });
