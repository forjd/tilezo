import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { basename, resolve } from "node:path";

type EnvValues = Record<string, string>;

const args = new Set(Bun.argv.slice(2));
const envPath = ".env";
const cwd = resolve(".");
const existingEnv = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const existingValues = parseEnv(existingEnv);
const force = args.has("--force");
const printOnly = args.has("--print");

const generated = await generateWorktreeEnv(existingValues);

if (printOnly) {
  for (const [key, value] of Object.entries(generated)) {
    console.log(`export ${key}=${shellQuote(value)}`);
  }

  process.exit(0);
}

if (force || !existingEnv) {
  writeFileSync(envPath, serializeEnv(generated));
  console.log(`Wrote ${envPath} for ${generated.COMPOSE_PROJECT_NAME}`);
} else {
  const missing = Object.entries(generated).filter(([key]) => !(key in existingValues));

  if (missing.length === 0) {
    console.log(`${envPath} already has the worktree keys.`);
  } else {
    writeFileSync(
      envPath,
      `${existingEnv.trimEnd()}\n\n# Tilezo worktree defaults\n${missing
        .map(([key, value]) => `${key}=${value}`)
        .join("\n")}\n`,
    );
    console.log(`Added ${missing.length} missing worktree keys to ${envPath}.`);
  }
}

console.log(`Compose project: ${generated.COMPOSE_PROJECT_NAME}`);
console.log(`Server: http://localhost:${generated.SERVER_PORT}`);
console.log(`Client: http://localhost:${generated.CLIENT_PORT}`);
console.log(`Postgres: localhost:${generated.DB_PORT}/${generated.POSTGRES_DB}`);
console.log("");
console.log("Next:");
console.log("  bun run db:up");
console.log("  bun run db:migrate");
console.log("  bun run dev");

async function generateWorktreeEnv(existing: EnvValues): Promise<EnvValues> {
  const worktreeName = slugify(currentBranch() ?? basename(cwd));
  const seed = hashString(`${cwd}:${worktreeName}`);
  const projectName = existing.COMPOSE_PROJECT_NAME ?? `tilezo_${worktreeName}_${hashSuffix(seed)}`;

  const serverPort = Number(
    existing.SERVER_PORT ??
      existing.PORT ??
      (await findAvailablePortPair(3100 + (seed % 300) * 2))[0],
  );
  const clientPort = Number(
    existing.CLIENT_PORT ??
      (await findAvailablePort(serverPort + 1, { blocked: new Set([serverPort]) })),
  );
  const dbPort = Number(existing.DB_PORT ?? (await findAvailablePort(5500 + (seed % 300))));

  const postgresDb = existing.POSTGRES_DB ?? "tilezo";
  const postgresUser = existing.POSTGRES_USER ?? "postgres";
  const postgresPassword = existing.POSTGRES_PASSWORD ?? randomSecret(24);

  return {
    COMPOSE_PROJECT_NAME: projectName,
    SERVER_PORT: String(serverPort),
    CLIENT_PORT: String(clientPort),
    DB_PORT: String(dbPort),
    POSTGRES_DB: postgresDb,
    POSTGRES_USER: postgresUser,
    POSTGRES_PASSWORD: postgresPassword,
    HOST: existing.HOST ?? "0.0.0.0",
    PORT: existing.PORT ?? String(serverPort),
    DATABASE_URL:
      existing.DATABASE_URL ??
      `postgres://${postgresUser}:${postgresPassword}@localhost:${dbPort}/${postgresDb}`,
    AUTH_SECRET: existing.AUTH_SECRET ?? randomSecret(48),
    NODE_ENV: existing.NODE_ENV ?? "development",
    PUBLIC_API_URL: existing.PUBLIC_API_URL ?? `http://localhost:${serverPort}`,
    PUBLIC_WS_URL: existing.PUBLIC_WS_URL ?? `ws://localhost:${serverPort}/ws`,
  };
}

function currentBranch(): string | undefined {
  try {
    const branch = execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    return branch || undefined;
  } catch {
    return undefined;
  }
}

function parseEnv(contents: string): EnvValues {
  const values: EnvValues = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    values[key] = stripQuotes(value);
  }

  return values;
}

function serializeEnv(values: EnvValues): string {
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;
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

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "worktree"
  );
}

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function hashSuffix(value: number): string {
  return value.toString(36).padStart(6, "0").slice(0, 6);
}

async function findAvailablePortPair(start: number): Promise<[number, number]> {
  for (let offset = 0; offset < 600; offset += 2) {
    const first = start + offset;
    const second = first + 1;

    if ((await isPortAvailable(first)) && (await isPortAvailable(second))) {
      return [first, second];
    }
  }

  throw new Error(`No available adjacent ports near ${start}`);
}

async function findAvailablePort(
  start: number,
  options: { blocked?: Set<number> } = {},
): Promise<number> {
  for (let offset = 0; offset < 600; offset += 1) {
    const port = start + offset;

    if (options.blocked?.has(port)) {
      continue;
    }

    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No available port near ${start}`);
}

async function isPortAvailable(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function randomSecret(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}
