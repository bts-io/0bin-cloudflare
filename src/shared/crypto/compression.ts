import { MAX_INFLATED_BYTES } from "./constants";
import { PasteCryptoError } from "./errors";

async function readAll(stream: ReadableStream<Uint8Array>, cap: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      // Stop inflating at once: a bomb must not get to allocate its full output.
      await reader.cancel();
      throw new PasteCryptoError("too_large", "content exceeds the size limit");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** deflate-raw via the native CompressionStream. */
export function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return readAll(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw")),
    Number.POSITIVE_INFINITY,
  );
}

/** Inverse of deflate, throwing "too_large" once output passes 16 MiB. */
export async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return await readAll(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")),
      MAX_INFLATED_BYTES,
    );
  } catch (err) {
    if (err instanceof PasteCryptoError) throw err;
    throw new PasteCryptoError("bad_format", "content is not valid deflate data");
  }
}
