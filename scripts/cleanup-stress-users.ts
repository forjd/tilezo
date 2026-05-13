import { loadServerEnv } from "./server-env";

type CleanupOptions = {
  dryRun: boolean;
  force: boolean;
  prefix: string;
};

const DEFAULT_OPTIONS: CleanupOptions = {
  dryRun: false,
  force: false,
  prefix: "stress_",
};

if (import.meta.main) {
  if (Bun.argv.includes("--help") || Bun.argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const options = parseArgs(Bun.argv.slice(2));
  const result = await cleanupStressUsers(options);

  console.log("Tilezo stress user cleanup");
  console.log(`Prefix: ${options.prefix}`);
  console.log(`Dry run: ${options.dryRun ? "yes" : "no"}`);
  console.log(`Matched users: ${result.matched.toString()}`);
  console.log(`Deleted users: ${result.deleted.toString()}`);
}

export function parseArgs(args: string[]): CleanupOptions {
  const options = { ...DEFAULT_OPTIONS };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey ?? "";

    if (key === "dry-run" || key === "force") {
      applyOption(options, key, inlineValue ?? "true");
      continue;
    }

    const value = inlineValue ?? args[index + 1];

    if (inlineValue === undefined) {
      index += 1;
    }

    if (value === undefined) {
      throw new Error(`Missing value for --${key}`);
    }

    applyOption(options, key, value);
  }

  return validateOptions(options);
}

export async function cleanupStressUsers(options: CleanupOptions): Promise<{
  deleted: number;
  matched: number;
}> {
  const env = loadServerEnv();
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to clean up stress users");
  }

  const sql = new Bun.SQL(databaseUrl);
  const usernamePattern = `${options.prefix.toLocaleLowerCase("en-US")}%`;

  try {
    const matchedUsers = await sql<{ id: string }[]>`
      select id from users where username_key like ${usernamePattern}
    `;

    if (options.dryRun || matchedUsers.length === 0) {
      return { matched: matchedUsers.length, deleted: 0 };
    }

    const deletedUsers = await sql<{ id: string }[]>`
      delete from users where username_key like ${usernamePattern} returning id
    `;

    return { matched: matchedUsers.length, deleted: deletedUsers.length };
  } finally {
    await sql.close();
  }
}

function applyOption(options: CleanupOptions, key: string, value: string): void {
  switch (key) {
    case "dry-run":
      options.dryRun = parseBoolean(key, value);
      break;
    case "force":
      options.force = parseBoolean(key, value);
      break;
    case "prefix":
      options.prefix = value;
      break;
    default:
      throw new Error(`Unknown option --${key}`);
  }
}

function validateOptions(options: CleanupOptions): CleanupOptions {
  const normalizedPrefix = options.prefix.trim().toLocaleLowerCase("en-US");

  if (!normalizedPrefix) {
    throw new Error("--prefix cannot be empty");
  }

  if (!options.force && (!normalizedPrefix.startsWith("stress_") || normalizedPrefix.length < 7)) {
    throw new Error(
      "--prefix must start with stress_ and be at least 7 characters; use --force to override",
    );
  }

  options.prefix = normalizedPrefix;
  return options;
}

function parseBoolean(key: string, value: string): boolean {
  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new Error(`--${key} must be true or false`);
}

function printUsage(): void {
  console.log(`Usage: bun run cleanup:stress-users -- [options]

Options:
  --prefix <text>  Username prefix to delete (default: stress_)
  --dry-run        Count matching users without deleting
  --force          Allow non-standard prefixes
`);
}
