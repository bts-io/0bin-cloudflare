import { sql } from "drizzle-orm";
import { getDb } from "../db";

const BATCH = 500;
const MAX_ROUNDS = 20;

/**
 * Deletes pastes whose `expires_at` has passed, 500 rows per statement, until a round deletes fewer than
 * 500 or 20 rounds ran (spec 6.2). Reads already hide expired rows, so this only reclaims storage.
 * Returns how many rows went.
 */
export async function purgeExpired(d1: D1Database, now = Date.now()): Promise<number> {
  const db = getDb(d1);
  let deleted = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { meta } = await db.run(
      sql`DELETE FROM pastes WHERE id IN (SELECT id FROM pastes WHERE expires_at IS NOT NULL AND expires_at <= ${now} LIMIT ${BATCH})`,
    );
    deleted += meta.changes;
    if (meta.changes < BATCH) break;
  }
  return deleted;
}
