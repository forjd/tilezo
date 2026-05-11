import { spawnSync } from "node:child_process";
import { loadServerEnv } from "./server-env";

const command = Bun.argv[2];
const supportedCommands = new Set(["generate", "migrate", "studio"]);

if (!command || !supportedCommands.has(command)) {
  throw new Error("Usage: bun run scripts/run-server-db.ts <generate|migrate|studio>");
}

const result = spawnSync("bun", ["run", "--cwd", "apps/server", `db:${command}`], {
  env: loadServerEnv(),
  stdio: "inherit",
});

process.exit(result.status ?? 1);
