import { beforeEach, describe, expect, it } from "vitest";
import { buildCreateRequest, decryptPaste, encryptPaste } from "../../src/shared/crypto";
import { CreatePasteBody, PasteRead } from "../../src/shared/schemas/paste";
import { type Created, getPaste, postPaste, resetDb } from "./helpers";

beforeEach(resetDb);

// The seam between the browser crypto module and the API: what the client builds is what the server accepts,
// and what the server returns decrypts to the original paste.
describe("browser crypto through the API", () => {
  it("creates, reads and decrypts a text paste", async () => {
    const text = "hello from the round trip\n".repeat(200);
    const paste = await encryptPaste({ kind: "text", body: text, title: "notes", lang: "markdown" });
    const body = buildCreateRequest(paste, { expiry: "1d", burn: false });
    expect(CreatePasteBody.safeParse(body).success).toBe(true);

    const res = await postPaste(body);
    expect(res.status).toBe(201);
    const created = (await res.json()) as Created;

    const read = PasteRead.parse(
      await (await getPaste(created.id, { "x-read-token": paste.readToken })).json(),
    );
    const { header, body: bytes } = await decryptPaste(paste.ikm, read.ciphertext, read.kind);
    expect(new TextDecoder().decode(bytes)).toBe(text);
    expect(header).toMatchObject({ kind: "text", title: "notes", lang: "markdown" });
  });

  it("burns a file paste after the one read that decrypts it", async () => {
    const file = crypto.getRandomValues(new Uint8Array(4096));
    const paste = await encryptPaste({
      kind: "file",
      body: file,
      name: "data.bin",
      mime: "application/octet-stream",
    });
    const created = (await (
      await postPaste(buildCreateRequest(paste, { expiry: "1h", burn: true }))
    ).json()) as Created;

    const first = PasteRead.parse(
      await (await getPaste(created.id, { "x-read-token": paste.readToken })).json(),
    );
    expect(first.burned).toBe(true);
    expect((await decryptPaste(paste.ikm, first.ciphertext, first.kind)).body).toEqual(file);
    expect((await getPaste(created.id, { "x-read-token": paste.readToken })).status).toBe(404);
  });
});
