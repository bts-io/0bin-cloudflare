/** Format constants for blob v1 (spec section 4). Changing any of these breaks every existing link. */

/** First byte of every blob; the server checks it too. */
export const FORMAT_VERSION = 0x01;
/** Version inside the encrypted header JSON. */
export const HEADER_VERSION = 1;

/** Link secret length: 32 bytes encode to 43 base64url chars. */
export const IKM_BYTES = 32;
export const IKM_B64_LENGTH = 43;
/** Read token length (HKDF output), same encoding as the ikm. */
export const READ_TOKEN_BYTES = 32;

export const HKDF_INFO_ENC = "0bin-cf/v1/enc";
export const HKDF_INFO_READ = "0bin-cf/v1/read";
/** AAD is this prefix + kind, so the server cannot relabel a paste. */
export const AAD_PREFIX = "0bin-cf/v1|";

export const IV_BYTES = 12;
export const TAG_BITS = 128;

/** Viewer-side decompression bomb guard. */
export const MAX_INFLATED_BYTES = 16 * 1024 * 1024;

/** Header limits, client-enforced on encrypt and checked again after decrypt. */
export const HEADER_LIMITS = {
  jsonBytes: 4096,
  title: 100,
  name: 255,
  mime: 127,
  lang: 32,
} as const;

export const KINDS = ["text", "file"] as const;
export const EXPIRIES = ["1h", "1d", "1w", "1m", "never"] as const;
