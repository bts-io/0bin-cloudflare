import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "./db";
import { fail, notFound } from "./lib/http";
import { adminRoutes } from "./routes/admin";
import { configRoutes } from "./routes/config";
import { pasteRoutes } from "./routes/pastes";
import { statsRoutes } from "./routes/stats";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", async (c) => {
  try {
    await getDb(c.env.DB).run(sql`SELECT 1`);
    return c.json({ ok: true, db: "ok" });
  } catch (err) {
    console.error("[health] d1 check failed", err);
    return c.json({ ok: false, db: "error" }, 503);
  }
});

app.route("/api/config", configRoutes);
app.route("/api/pastes", pasteRoutes);
app.route("/api/stats", statsRoutes);
app.route("/api/admin", adminRoutes);

app.notFound(notFound);

app.onError((err, c) => {
  // Hono raises 400 for a body that is not valid JSON.
  if (err instanceof HTTPException)
    return fail(c, err.status, err.status === 400 ? "invalid_request" : "http_error", err.message);
  console.error(err);
  return fail(c, 500, "internal", "Something went wrong");
});

export default app;
