import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Create a D1 database and set APP_D1_DATABASE_ID before building."
    );
  }

  return drizzle(env.DB, { schema });
}
