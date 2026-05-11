import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function loadServerEnv(): Record<string, string | undefined> {
  const env = {
    ...readEnvFile(resolve(projectRoot, ".env")),
    ...process.env,
  };

  env.DATABASE_URL ??= defaultDatabaseUrl(env);

  return env;
}

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }

  const values: Record<string, string> = {};

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    values[trimmed.slice(0, equalsIndex).trim()] = stripQuotes(
      trimmed.slice(equalsIndex + 1).trim(),
    );
  }

  return values;
}

function defaultDatabaseUrl(env: Record<string, string | undefined>): string {
  const user = env.POSTGRES_USER ?? "postgres";
  const password = env.POSTGRES_PASSWORD ?? "postgres";
  const port = env.DB_PORT ?? "5432";
  const database = env.POSTGRES_DB ?? "tilezo";

  return `postgres://${user}:${password}@localhost:${port}/${database}`;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
