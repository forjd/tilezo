import { type BunSQLDatabase, drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";

export type TilezoDatabase = BunSQLDatabase<typeof schema>;

export function getDatabaseUrl(env = Bun.env): string | undefined {
  return env.DATABASE_URL;
}

export function createDatabase(databaseUrl: string | undefined): TilezoDatabase | undefined {
  if (!databaseUrl) {
    return undefined;
  }

  return drizzle(databaseUrl, { schema });
}
