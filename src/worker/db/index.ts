import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export const getDb = (d1: D1Database) => drizzle(d1, { schema, casing: "snake_case" });
export type Db = ReturnType<typeof getDb>;
