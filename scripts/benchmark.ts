import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cleanupStressUsers } from "./cleanup-stress-users";

type BenchmarkProfile = "quick" | "standard";

type BenchmarkOptions = {
  apiUrl: string;
  authBots: number;
  cleanupAfter: boolean;
  outputDir: string;
  profile: BenchmarkProfile;
  requestTimeoutMs: number;
  roomBots: number;
  roomDurationSeconds: number;
  setupConcurrency: number;
  wsUrl: string;
};

type BenchmarkRun = {
  command: string[];
  durationMs: number;
  exitCode: number;
  metricsFile: string;
  name: string;
  stderrFile: string;
  stdoutFile: string;
  summary: StressSummary;
};

type StressSummary = {
  actions?: { messages: number; moves: number };
  averageMs?: number;
  bots?: { failed: number; succeeded: number; total: number };
  operations: Record<string, OperationSummary>;
  p95Ms?: number;
};

type OperationSummary = {
  averageMs: number;
  count: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
};

type BenchmarkReport = {
  cleanup?: { deleted: number; matched: number; prefix: string };
  finishedAt: string;
  gitCommit: string;
  options: BenchmarkOptions;
  outputDir: string;
  runs: BenchmarkRun[];
  startedAt: string;
};

const DEFAULT_OPTIONS: BenchmarkOptions = {
  apiUrl: "http://localhost:3000",
  authBots: 100,
  cleanupAfter: true,
  outputDir: "tmp/benchmarks",
  profile: "standard",
  requestTimeoutMs: 30_000,
  roomBots: 500,
  roomDurationSeconds: 60,
  setupConcurrency: 5,
  wsUrl: "ws://localhost:3000/ws",
};

if (import.meta.main) {
  if (Bun.argv.includes("--help") || Bun.argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const options = parseArgs(Bun.argv.slice(2));
  const report = await runBenchmark(options);

  console.log("Tilezo benchmark report");
  console.log(`Output: ${report.outputDir}`);

  for (const run of report.runs) {
    const bots = run.summary.bots;
    const status = run.exitCode === 0 ? "ok" : "failed";
    const botSummary = bots ? `${bots.succeeded}/${bots.total}` : "unknown";
    console.log(
      `- ${run.name}: ${status}, bots ${botSummary}, p95 ${formatMaybeMs(run.summary.p95Ms)}`,
    );
  }

  process.exit(report.runs.every((run) => run.exitCode === 0) ? 0 : 1);
}

export function parseArgs(args: string[]): BenchmarkOptions {
  const options = { ...DEFAULT_OPTIONS };
  const explicit = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey ?? "";

    if (key === "cleanup-after") {
      explicit.add(key);
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

    explicit.add(key);
    applyOption(options, key, value);
  }

  applyProfileDefaults(options, explicit);
  return options;
}

export async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkReport> {
  const startedAt = new Date();
  const gitCommit = git(["rev-parse", "--short", "HEAD"]) || "unknown";
  const safeTimestamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const runPrefix = `stress_bench_${safeTimestamp.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const outputDir = resolve(options.outputDir, `${safeTimestamp}_${gitCommit}`);
  const runs: BenchmarkRun[] = [];

  await mkdir(outputDir, { recursive: true });

  runs.push(
    await runAndCapture({
      args: [
        "--scenario",
        "auth",
        "--auth-mode",
        "register",
        "--bots",
        options.authBots.toString(),
        "--concurrency",
        options.authBots.toString(),
        "--request-timeout-ms",
        options.requestTimeoutMs.toString(),
        "--username-prefix",
        `${runPrefix}_auth_register`,
      ],
      name: "auth-register",
      options,
      outputDir,
    }),
  );
  runs.push(
    await runAndCapture({
      args: [
        "--scenario",
        "auth",
        "--auth-mode",
        "login",
        "--bots",
        options.authBots.toString(),
        "--concurrency",
        options.authBots.toString(),
        "--setup-concurrency",
        options.setupConcurrency.toString(),
        "--request-timeout-ms",
        options.requestTimeoutMs.toString(),
        "--username-prefix",
        `${runPrefix}_auth_login`,
      ],
      name: "auth-login",
      options,
      outputDir,
    }),
  );
  runs.push(
    await runAndCapture({
      args: [
        "--scenario",
        "full",
        "--preseed-users",
        "--bots",
        options.roomBots.toString(),
        "--concurrency",
        options.roomBots.toString(),
        "--duration",
        options.roomDurationSeconds.toString(),
        "--setup-concurrency",
        options.setupConcurrency.toString(),
        "--request-timeout-ms",
        options.requestTimeoutMs.toString(),
        "--username-prefix",
        `${runPrefix}_room`,
      ],
      name: "room-loop",
      options,
      outputDir,
    }),
  );

  const report: BenchmarkReport = {
    finishedAt: new Date().toISOString(),
    gitCommit,
    options,
    outputDir,
    runs,
    startedAt: startedAt.toISOString(),
  };

  if (options.cleanupAfter) {
    report.cleanup = {
      prefix: runPrefix,
      ...(await cleanupStressUsers({
        dryRun: false,
        force: false,
        prefix: runPrefix,
      })),
    };
  }

  await writeFile(resolve(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(resolve(outputDir, "report.md"), renderMarkdownReport(report));

  return report;
}

function applyOption(options: BenchmarkOptions, key: string, value: string): void {
  switch (key) {
    case "api":
      options.apiUrl = value;
      break;
    case "auth-bots":
      options.authBots = parsePositiveInteger(key, value);
      break;
    case "cleanup-after":
      options.cleanupAfter = parseBoolean(key, value);
      break;
    case "output-dir":
      options.outputDir = value;
      break;
    case "profile":
      options.profile = parseProfile(value);
      break;
    case "request-timeout-ms":
      options.requestTimeoutMs = parsePositiveInteger(key, value);
      break;
    case "room-bots":
      options.roomBots = parsePositiveInteger(key, value);
      break;
    case "room-duration":
      options.roomDurationSeconds = parseNonNegativeNumber(key, value);
      break;
    case "setup-concurrency":
      options.setupConcurrency = parsePositiveInteger(key, value);
      break;
    case "ws":
      options.wsUrl = value;
      break;
    default:
      throw new Error(`Unknown option --${key}`);
  }
}

function applyProfileDefaults(options: BenchmarkOptions, explicit: Set<string>): void {
  if (options.profile === "quick") {
    if (!explicit.has("auth-bots")) {
      options.authBots = 25;
    }

    if (!explicit.has("room-bots")) {
      options.roomBots = 50;
    }

    if (!explicit.has("room-duration")) {
      options.roomDurationSeconds = 10;
    }
  }
}

async function runAndCapture(input: {
  args: string[];
  name: string;
  options: BenchmarkOptions;
  outputDir: string;
}): Promise<BenchmarkRun> {
  await resetMetrics(input.options.apiUrl);
  const command = [
    "bun",
    "run",
    "scripts/stress-test.ts",
    "--api",
    input.options.apiUrl,
    "--ws",
    input.options.wsUrl,
    ...input.args,
  ];
  const startedAt = performance.now();
  const result = spawnSync(command[0] as string, command.slice(1), {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const durationMs = performance.now() - startedAt;
  const metrics = await fetchMetrics(input.options.apiUrl);
  const stdoutFile = `${input.name}.stdout.txt`;
  const stderrFile = `${input.name}.stderr.txt`;
  const metricsFile = `${input.name}.metrics.json`;

  await writeFile(resolve(input.outputDir, stdoutFile), result.stdout ?? "");
  await writeFile(resolve(input.outputDir, stderrFile), result.stderr ?? "");
  await writeFile(resolve(input.outputDir, metricsFile), `${JSON.stringify(metrics, null, 2)}\n`);

  return {
    command,
    durationMs,
    exitCode: result.status ?? 1,
    metricsFile,
    name: input.name,
    stderrFile,
    stdoutFile,
    summary: parseStressSummary(result.stdout ?? ""),
  };
}

async function resetMetrics(apiUrl: string): Promise<void> {
  const response = await fetch(`${apiUrl}/debug/metrics/reset`, { method: "POST" });

  if (!response.ok) {
    throw new Error(`Unable to reset metrics: HTTP ${response.status.toString()}`);
  }
}

async function fetchMetrics(apiUrl: string): Promise<unknown> {
  const response = await fetch(`${apiUrl}/debug/metrics`);

  if (!response.ok) {
    throw new Error(`Unable to fetch metrics: HTTP ${response.status.toString()}`);
  }

  return await response.json();
}

export function parseStressSummary(output: string): StressSummary {
  const summary: StressSummary = { operations: {} };
  const lines = output.split(/\r?\n/);

  for (const line of lines) {
    const bots = /^Bots: (\d+) \((\d+) ok, (\d+) failed\)$/.exec(line);
    if (bots) {
      summary.bots = {
        total: Number(bots[1]),
        succeeded: Number(bots[2]),
        failed: Number(bots[3]),
      };
      continue;
    }

    const actions = /^Actions: (\d+) moves, (\d+) messages$/.exec(line);
    if (actions) {
      summary.actions = {
        moves: Number(actions[1]),
        messages: Number(actions[2]),
      };
      continue;
    }

    const average = /^Average: ([\d.]+)ms$/.exec(line);
    if (average) {
      summary.averageMs = Number(average[1]);
      continue;
    }

    const p95 = /^P95: ([\d.]+)ms$/.exec(line);
    if (p95) {
      summary.p95Ms = Number(p95[1]);
      continue;
    }

    const operation =
      /^([a-z.]+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$/.exec(line);
    if (operation) {
      summary.operations[operation[1] as string] = {
        count: Number(operation[2]),
        averageMs: Number(operation[3]),
        p50Ms: Number(operation[4]),
        p95Ms: Number(operation[5]),
        p99Ms: Number(operation[6]),
        maxMs: Number(operation[7]),
      };
    }
  }

  return summary;
}

function renderMarkdownReport(report: BenchmarkReport): string {
  const lines = [
    "# Tilezo Benchmark Report",
    "",
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Git commit: ${report.gitCommit}`,
    `- Profile: ${report.options.profile}`,
    `- API: ${report.options.apiUrl}`,
    `- WebSocket: ${report.options.wsUrl}`,
    `- Auth bots: ${report.options.authBots.toString()}`,
    `- Room bots: ${report.options.roomBots.toString()}`,
    `- Room duration: ${report.options.roomDurationSeconds.toString()}s`,
    "",
    "| Run | Exit | Bots | Avg | P95 | Moves | Messages |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const run of report.runs) {
    const bots = run.summary.bots;
    const actions = run.summary.actions;
    lines.push(
      `| ${run.name} | ${run.exitCode.toString()} | ${bots ? `${bots.succeeded}/${bots.total}` : ""} | ${formatMaybeMs(
        run.summary.averageMs,
      )} | ${formatMaybeMs(run.summary.p95Ms)} | ${actions?.moves.toString() ?? "0"} | ${
        actions?.messages.toString() ?? "0"
      } |`,
    );
  }

  lines.push("", "## Operation P95", "");

  for (const run of report.runs) {
    lines.push(
      `### ${run.name}`,
      "",
      "| Operation | Count | P95 | P99 | Max |",
      "| --- | ---: | ---: | ---: | ---: |",
    );

    for (const [name, operation] of Object.entries(run.summary.operations)) {
      lines.push(
        `| ${name} | ${operation.count.toString()} | ${formatMaybeMs(operation.p95Ms)} | ${formatMaybeMs(
          operation.p99Ms,
        )} | ${formatMaybeMs(operation.maxMs)} |`,
      );
    }

    lines.push("");
  }

  if (report.cleanup) {
    lines.push(
      "## Cleanup",
      "",
      `- Prefix: ${report.cleanup.prefix}`,
      `- Matched users: ${report.cleanup.matched.toString()}`,
      `- Deleted users: ${report.cleanup.deleted.toString()}`,
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}

function git(args: string[]): string | undefined {
  const result = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function parseProfile(value: string): BenchmarkProfile {
  if (value === "quick" || value === "standard") {
    return value;
  }

  throw new Error("--profile must be quick or standard");
}

function parsePositiveInteger(key: string, value: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${key} must be a positive integer`);
  }

  return parsed;
}

function parseNonNegativeNumber(key: string, value: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`--${key} must be a non-negative number`);
  }

  return parsed;
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

function formatMaybeMs(value: number | undefined): string {
  return value === undefined ? "n/a" : `${value.toFixed(1)}ms`;
}

function printUsage(): void {
  console.log(`Usage: bun run benchmark -- [options]

Options:
  --api <url>                  HTTP API URL (default: http://localhost:3000)
  --ws <url>                   WebSocket URL (default: ws://localhost:3000/ws)
  --profile <name>             quick or standard (default: standard)
  --auth-bots <count>          Auth benchmark bots (standard default: 100)
  --room-bots <count>          Room-loop benchmark bots (standard default: 500)
  --room-duration <seconds>    Room-loop duration (standard default: 60)
  --setup-concurrency <count>  Preseed concurrency (default: 5)
  --request-timeout-ms <ms>    HTTP setup request timeout (default: 30000)
  --output-dir <path>          Report root directory (default: tmp/benchmarks)
  --cleanup-after <bool>       Delete benchmark-created users afterward (default: true)
`);
}
