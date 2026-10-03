/**
 * API contract for `/api/admin/*` (docs/spec.md section 5.7), shared by the Worker and the admin page.
 * Admin responses never carry ciphertext or token hashes.
 */
import { z } from "zod";
import { PasteMeta } from "./paste";

/** `active`: not yet expired (or never expires); `expired`: past `expiresAt`, waiting for the purge. */
export const PasteState = z.enum(["active", "expired"]);
export type PasteState = z.infer<typeof PasteState>;

/** Opaque page cursor `<createdAt>:<id>` of the last item on the previous page. */
export const AdminCursor = z.string().regex(/^\d{1,16}:[A-Za-z0-9_-]{12}$/);

export const AdminListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: AdminCursor.optional(),
  state: PasteState.default("active"),
});
export type AdminListQuery = z.infer<typeof AdminListQuery>;

export const AdminPasteItem = PasteMeta;
export type AdminPasteItem = z.infer<typeof AdminPasteItem>;

/** Ordered `createdAt DESC, id DESC`; `nextCursor` is null on the last page. */
export const AdminPasteList = z.object({
  items: z.array(AdminPasteItem),
  nextCursor: AdminCursor.nullable(),
});
export type AdminPasteList = z.infer<typeof AdminPasteList>;

/** `active`, `burnPending` and `totalBytes` count unexpired rows; `pastesCreated` is the all-time counter. */
export const AdminStats = z.object({
  active: z.number().int().nonnegative(),
  burnPending: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  pastesCreated: z.number().int().nonnegative(),
});
export type AdminStats = z.infer<typeof AdminStats>;

export const AdminPurgeResult = z.object({ deleted: z.number().int().nonnegative() });
export type AdminPurgeResult = z.infer<typeof AdminPurgeResult>;
