import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadServerEnv, projectRoot } from "./server-env";

const result = spawnSync("bun", ["--watch", "src/index.ts"], {
  cwd: resolve(projectRoot, "apps/server"),
  env: loadServerEnv(),
  stdio: "inherit",
});

process.exit(result.status ?? 1);
