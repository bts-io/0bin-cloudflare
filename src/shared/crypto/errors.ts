/**
 * Every failure in this module is a PasteCryptoError so the UI can show one message per code
 * without leaking WebCrypto internals. AES-GCM failures (wrong key, tampering, wrong kind) all map
 * to "decrypt_failed" on purpose: they are indistinguishable to the viewer.
 */
export type PasteCryptoErrorCode =
  | "bad_encoding"
  | "bad_format"
  | "bad_header"
  | "decrypt_failed"
  | "too_large"
  | "invalid_options";

export class PasteCryptoError extends Error {
  readonly code: PasteCryptoErrorCode;

  constructor(code: PasteCryptoErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PasteCryptoError";
    this.code = code;
  }
}
