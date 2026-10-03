/**
 * API contract for pastes (docs/spec.md section 5), shared by the Worker and the browser client.
 */
import { z } from "zod";
import { EXPIRIES, KINDS } from "../crypto/constants";

/** Largest decoded blob the server stores (spec 7.1): 1 MiB. */
export const MAX_CIPHERTEXT_BYTES = 1_048_576;
/** The same limit as base64url characters without padding: ceil(MAX * 4 / 3). */
export const MAX_CIPHERTEXT_B64 = Math.ceil((MAX_CIPHERTEXT_BYTES * 4) / 3);
/** Smallest blob: version byte + 12-byte IV + 16-byte GCM tag = 29 bytes = 39 base64url chars. */
export const MIN_CIPHERTEXT_B64 = 39;

export const B64U = /^[A-Za-z0-9_-]+$/;
export const Id = z.string().regex(/^[A-Za-z0-9_-]{12}$/);
export const Token = z.string().regex(B64U).length(43);
export const Expiry = z.enum(EXPIRIES);
export const Kind = z.enum(KINDS);

/** Milliseconds each expiry option adds to `createdAt`; `never` stores NULL (spec 6.1). */
export const EXPIRY_MS = {
  "1h": 3_600_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
  "1m": 2_592_000_000,
  never: null,
} as const satisfies Record<z.infer<typeof Expiry>, number | null>;

export const CreatePasteBody = z
  .object({
    ciphertext: z.string().regex(B64U).min(MIN_CIPHERTEXT_B64).max(MAX_CIPHERTEXT_B64),
    kind: Kind,
    expiry: Expiry.default("1d"),
    burn: z.boolean().default(false),
    readToken: Token,
  })
  .strict()
  .refine((b) => !(b.burn && b.expiry === "never"), { path: ["expiry"], message: "burn_requires_expiry" });
export type CreatePasteBody = z.infer<typeof CreatePasteBody>;

export const CreatePasteResponse = z.object({
  id: Id,
  url: z.string(),
  ownerToken: Token,
  createdAt: z.number().int(),
  expiresAt: z.number().int().nullable(),
  burn: z.boolean(),
});
export type CreatePasteResponse = z.infer<typeof CreatePasteResponse>;

export const PasteMeta = z.object({
  id: Id,
  kind: Kind,
  size: z.number().int(),
  burn: z.boolean(),
  createdAt: z.number().int(),
  expiresAt: z.number().int().nullable(),
});
export type PasteMeta = z.infer<typeof PasteMeta>;

export const PasteRead = z.object({
  id: Id,
  ciphertext: z.string(),
  kind: Kind,
  burn: z.boolean(),
  createdAt: z.number().int(),
  expiresAt: z.number().int().nullable(),
  burned: z.boolean(),
});
export type PasteRead = z.infer<typeof PasteRead>;
