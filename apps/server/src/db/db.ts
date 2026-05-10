export function getDatabaseUrl(env = Bun.env): string | undefined {
  return env.DATABASE_URL;
}

export function createDatabaseClient(databaseUrl = getDatabaseUrl()): unknown | undefined {
  if (!databaseUrl) {
    return undefined;
  }

  const BunWithSql = Bun as unknown as {
    SQL?: new (url: string) => unknown;
  };

  return BunWithSql.SQL ? new BunWithSql.SQL(databaseUrl) : undefined;
}
