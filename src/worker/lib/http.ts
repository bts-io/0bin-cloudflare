import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Error body shared by every API route (spec 5): `{ error, message?, issues? }`. */
export const fail = (
  c: Context,
  status: ContentfulStatusCode,
  error: string,
  message?: string,
  issues?: unknown[],
) => c.json({ error, ...(message && { message }), ...(issues && { issues }) }, status);

/** The 404 every unknown route, unknown paste and disabled create answers with. */
export const notFound = (c: Context) => fail(c, 404, "not_found", "Not found");
