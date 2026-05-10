import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type CoverageRecord = {
  functionsFound: number;
  functionsHit: number;
  linesFound: number;
  linesHit: number;
};

const coveragePath = "coverage/lcov.info";
const threshold = Number(Bun.env.COVERAGE_THRESHOLD ?? "80");

if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
  throw new Error("COVERAGE_THRESHOLD must be a number between 0 and 100");
}

if (!existsSync(coveragePath)) {
  throw new Error(`Missing ${coveragePath}. Run bun run test:coverage first.`);
}

const records = parseLcov(readFileSync(coveragePath, "utf8"));
const sourceFiles = listSourceFiles(["apps", "packages"]);
const unmeasuredFiles = sourceFiles.filter((file) => !records.has(file));
const measuredTotals = totalCoverage([...records.values()]);
const unmeasuredLineCount = unmeasuredFiles.reduce(
  (total, file) => total + countSignificantLines(file),
  0,
);
const adjustedLineTotal = measuredTotals.linesFound + unmeasuredLineCount;
const adjustedLineCoverage = percentage(measuredTotals.linesHit, adjustedLineTotal);

console.log(`Measured files: ${sourceFiles.length - unmeasuredFiles.length}/${sourceFiles.length}`);
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

if (adjustedLineCoverage < threshold) {
  throw new Error(
    `Adjusted line coverage ${adjustedLineCoverage.toFixed(2)}% is below ${threshold.toFixed(2)}%`,
  );
}

function parseLcov(lcov: string): Map<string, CoverageRecord> {
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

function listSourceFiles(directories: string[]): string[] {
  return directories
    .flatMap((directory) => walk(directory))
    .filter((file) => file.endsWith(".ts"))
    .filter((file) => !file.endsWith(".test.ts"))
    .filter((file) => !file.endsWith(".d.ts"))
    .sort();
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function countSignificantLines(file: string): number {
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

function totalCoverage(records: CoverageRecord[]): CoverageRecord {
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

function percentage(hit: number, found: number): number {
  return found === 0 ? 100 : (hit / found) * 100;
}
