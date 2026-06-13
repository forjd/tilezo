import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type CoverageRecord = {
  functionsFound: number;
  functionsHit: number;
  linesFound: number;
  linesHit: number;
};

const COVERAGE_PATH = "coverage/lcov.info";

// Security- and correctness-critical directories that must not be allowed to rot behind a
// single global aggregate (a large, well-covered UI file can otherwise mask an uncovered
// auth/routing module). Each must independently clear the critical floor.
const CRITICAL_DIRECTORIES = [
  "apps/server/src/auth",
  "apps/server/src/net",
  "apps/server/src/http",
  "apps/server/src/friends",
  "apps/server/src/rooms",
];

export function runCoverageCheck(env: Record<string, string | undefined> = Bun.env): void {
  const threshold = Number(env.COVERAGE_THRESHOLD ?? "80");
  const criticalThreshold = Number(env.CRITICAL_COVERAGE_THRESHOLD ?? "80");

  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new Error("COVERAGE_THRESHOLD must be a number between 0 and 100");
  }

  if (!Number.isFinite(criticalThreshold) || criticalThreshold < 0 || criticalThreshold > 100) {
    throw new Error("CRITICAL_COVERAGE_THRESHOLD must be a number between 0 and 100");
  }

  if (!existsSync(COVERAGE_PATH)) {
    throw new Error(`Missing ${COVERAGE_PATH}. Run bun run test:coverage first.`);
  }

  const records = parseLcov(readFileSync(COVERAGE_PATH, "utf8"));
  const sourceFiles = listSourceFiles(["apps", "packages"]);
  const sourceFileSet = new Set(sourceFiles);
  const unmeasuredFiles = sourceFiles.filter((file) => !records.has(file));
  // Only count product code under apps/packages. The gate scopes source discovery to those
  // trees, so the totals must too — otherwise low-coverage dev/ops scripts (benchmark,
  // stress-test, this very file) that tests happen to import would skew the product number.
  const measuredTotals = totalCoverage(
    [...records.entries()].filter(([file]) => sourceFileSet.has(file)).map(([, record]) => record),
  );
  const unmeasuredLineCount = unmeasuredFiles.reduce(
    (total, file) => total + countSignificantLines(file),
    0,
  );
  const adjustedLineTotal = measuredTotals.linesFound + unmeasuredLineCount;
  const adjustedLineCoverage = percentage(measuredTotals.linesHit, adjustedLineTotal);

  console.log(
    `Measured files: ${sourceFiles.length - unmeasuredFiles.length}/${sourceFiles.length}`,
  );
  console.log(
    `LCOV line coverage: ${measuredTotals.linesHit}/${measuredTotals.linesFound} (${percentage(
      measuredTotals.linesHit,
      measuredTotals.linesFound,
    ).toFixed(2)}%)`,
  );
  console.log(
    `LCOV function coverage: ${measuredTotals.functionsHit}/${measuredTotals.functionsFound} (${percentage(
      measuredTotals.functionsHit,
      measuredTotals.functionsFound,
    ).toFixed(2)}%)`,
  );
  console.log(
    `Adjusted line coverage: ${measuredTotals.linesHit}/${adjustedLineTotal} (${adjustedLineCoverage.toFixed(
      2,
    )}%)`,
  );

  if (unmeasuredFiles.length > 0) {
    console.log("Unmeasured source files:");

    for (const file of unmeasuredFiles) {
      console.log(`- ${file}`);
    }
  }

  const failures: string[] = [];

  for (const directory of CRITICAL_DIRECTORIES) {
    const stats = directoryCoverage(directory, sourceFiles, records);

    if (stats.adjustedFound === 0) {
      continue;
    }

    const coverage = percentage(stats.linesHit, stats.adjustedFound);
    console.log(
      `Critical ${directory}: ${stats.linesHit}/${stats.adjustedFound} (${coverage.toFixed(2)}%)`,
    );

    if (coverage < criticalThreshold) {
      failures.push(
        `${directory} adjusted line coverage ${coverage.toFixed(2)}% is below ${criticalThreshold.toFixed(2)}%`,
      );
    }
  }

  if (adjustedLineCoverage < threshold) {
    failures.push(
      `Adjusted line coverage ${adjustedLineCoverage.toFixed(2)}% is below ${threshold.toFixed(2)}%`,
    );
  }

  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
}

export function parseLcov(lcov: string): Map<string, CoverageRecord> {
  const records = new Map<string, CoverageRecord>();

  for (const rawRecord of lcov
    .trim()
    .split("end_of_record")
    .map((record) => record.trim())
    .filter(Boolean)) {
    const sourceFile = rawRecord.match(/^SF:(.+)$/m)?.[1];

    if (!sourceFile) {
      continue;
    }

    records.set(sourceFile, {
      functionsFound: numberField(rawRecord, "FNF"),
      functionsHit: numberField(rawRecord, "FNH"),
      linesFound: numberField(rawRecord, "LF"),
      linesHit: numberField(rawRecord, "LH"),
    });
  }

  return records;
}

function numberField(record: string, field: string): number {
  return Number(record.match(new RegExp(`^${field}:(\\d+)$`, "m"))?.[1] ?? 0);
}

function directoryCoverage(
  directory: string,
  sourceFiles: string[],
  records: Map<string, CoverageRecord>,
): { linesHit: number; adjustedFound: number } {
  const prefix = `${directory}/`;
  let linesHit = 0;
  let adjustedFound = 0;

  for (const file of sourceFiles) {
    if (!file.startsWith(prefix)) {
      continue;
    }

    const record = records.get(file);

    if (record) {
      linesHit += record.linesHit;
      adjustedFound += record.linesFound;
    } else {
      // Executable source not present in LCOV counts as fully uncovered.
      adjustedFound += countSignificantLines(file);
    }
  }

  return { linesHit, adjustedFound };
}

export function listSourceFiles(directories: string[]): string[] {
  return directories
    .flatMap((directory) => walk(directory))
    .filter((file) => file.endsWith(".ts"))
    .filter((file) => !file.endsWith(".test.ts"))
    .filter((file) => !file.endsWith(".d.ts"))
    .filter(isCoverageTarget)
    .sort();
}

// Preview-only browser wiring is excluded. Product entrypoints and composition roots still
// count toward adjusted coverage; if they are absent from LCOV they are treated as uncovered.
const EXCLUDED_PREVIEW_ENTRYPOINTS = ["apps/client/src/preview-entry.ts"];

export function isCoverageTarget(file: string): boolean {
  if (
    file.endsWith(".config.ts") ||
    file.endsWith("/types.ts") ||
    file.endsWith("Types.ts") ||
    EXCLUDED_PREVIEW_ENTRYPOINTS.some((root) => file === root || file.endsWith(`/${root}`))
  ) {
    return false;
  }

  const significantLines = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) => line && !line.startsWith("//") && !line.startsWith("/*") && !line.startsWith("*"),
    );

  return !significantLines.every(
    (line) =>
      line.startsWith("import type ") ||
      line.startsWith("export type ") ||
      /^export (\*|\{[^}]+}) from /.test(line),
  );
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function countSignificantLines(file: string): number {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed &&
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("/*") &&
        !trimmed.startsWith("*")
      );
    }).length;
}

export function totalCoverage(records: CoverageRecord[]): CoverageRecord {
  return records.reduce(
    (total, record) => ({
      functionsFound: total.functionsFound + record.functionsFound,
      functionsHit: total.functionsHit + record.functionsHit,
      linesFound: total.linesFound + record.linesFound,
      linesHit: total.linesHit + record.linesHit,
    }),
    {
      functionsFound: 0,
      functionsHit: 0,
      linesFound: 0,
      linesHit: 0,
    },
  );
}

export function percentage(hit: number, found: number): number {
  return found === 0 ? 100 : (hit / found) * 100;
}

if (import.meta.main) {
  runCoverageCheck();
}
