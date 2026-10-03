import { exportJWK, generateKeyPair, type JWTPayload, SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, type MockInstance, vi } from "vitest";

export const TEAM = "https://team-test.cloudflareaccess.com";
export const AUD = "aud-tag-for-tests";
export const KID = "test-key";
export const accessVars = { CREATE_MODE: "access", ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

export const now = () => Math.floor(Date.now() / 1000);

/**
 * Local RS256 keys standing in for an Access team. Registers hooks that serve the public key as the JWKS for
 * any team's certs URL and make every other fetch fail, so nothing reaches the network.
 */
export function setupAccessKeys() {
  const keys = {} as { signer: KeyPair; stranger: KeyPair; fetchSpy: MockInstance<typeof fetch> };
  let jwks: { keys: unknown[] };

  beforeAll(async () => {
    keys.signer = await generateKeyPair("RS256", { extractable: true });
    keys.stranger = await generateKeyPair("RS256");
    jwks = { keys: [{ ...(await exportJWK(keys.signer.publicKey)), kid: KID, alg: "RS256", use: "sig" }] };
  });
  beforeEach(() => {
    keys.fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith("/cdn-cgi/access/certs")) return Response.json(jwks);
      throw new Error(`unexpected fetch ${url}`);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  /** A token like Access issues; `claims` override any default, including iss, aud, email, nbf and exp. */
  const sign = (claims: JWTPayload = {}, key = keys.signer.privateKey) =>
    new SignJWT({
      iss: TEAM,
      aud: AUD,
      email: "someone@example.com",
      iat: now(),
      nbf: now() - 5,
      exp: now() + 300,
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: KID })
      .sign(key);

  return { keys, sign };
}
