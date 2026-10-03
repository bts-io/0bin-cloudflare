/**
 * API contract for `GET /api/config`: the public settings the browser needs, shared by the Worker and the client.
 */
import { z } from "zod";

export const PublicConfig = z.object({ turnstileSiteKey: z.string().min(1).nullable() });
export type PublicConfig = z.infer<typeof PublicConfig>;
