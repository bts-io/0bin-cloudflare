import type { CreatePasteBody } from "../schemas/paste";
import { EXPIRIES } from "./constants";
import { PasteCryptoError } from "./errors";
import type { EncryptedPaste } from "./paste";

export type Expiry = (typeof EXPIRIES)[number];

/**
 * Picks the server-visible fields out of an encrypted paste. Built field by field (no spread) so the
 * ikm can never ride along.
 */
export function buildCreateRequest(
  paste: EncryptedPaste,
  options: { expiry: Expiry; burn: boolean },
): CreatePasteBody {
  const { expiry, burn } = options;
  if (!EXPIRIES.includes(expiry)) throw new PasteCryptoError("invalid_options", "unknown expiry");
  // Burn pastes must expire: an unread one would otherwise live forever.
  if (burn && expiry === "never") throw new PasteCryptoError("invalid_options", "burn_requires_expiry");
  return { ciphertext: paste.ciphertext, kind: paste.kind, expiry, burn, readToken: paste.readToken };
}
