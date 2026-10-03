/**
 * API contract for `GET /api/stats` (docs/spec.md section 5.6), shared by the Worker and the browser client.
 */
import { z } from "zod";

export const Stats = z.object({ pastesCreated: z.number().int().nonnegative() });
export type Stats = z.infer<typeof Stats>;
