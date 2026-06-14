import { describe, expect, test } from "bun:test";
import {
  adjustCoverageRecordForSource,
  isCoverageTarget,
  parseLcov,
  percentage,
  totalCoverage,
} from "./check-coverage";

describe("parseLcov", () => {
  test("parses per-file line and function totals", () => {
    const lcov = [
      "SF:apps/server/src/auth/auth.ts",
      "FNF:10",
      "FNH:8",
      "LF:100",
      "LH:90",
      "end_of_record",
      "SF:packages/engine/src/grid.ts",
      "FNF:4",
      "FNH:4",
      "LF:20",
      "LH:20",
      "end_of_record",
    ].join("\n");

    const records = parseLcov(lcov);

    expect(records.size).toBe(2);
    expect(records.get("apps/server/src/auth/auth.ts")).toEqual({
      functionsFound: 10,
      functionsHit: 8,
      linesFound: 100,
      linesHit: 90,
    });
  });
});

describe("percentage", () => {
  test("returns 100 when nothing is found and a ratio otherwise", () => {
    expect(percentage(0, 0)).toBe(100);
    expect(percentage(90, 100)).toBe(90);
    expect(percentage(1, 4)).toBe(25);
  });
});

describe("totalCoverage", () => {
  test("sums line and function totals across records", () => {
    expect(
      totalCoverage([
        { functionsFound: 2, functionsHit: 1, linesFound: 10, linesHit: 5 },
        { functionsFound: 3, functionsHit: 3, linesFound: 20, linesHit: 18 },
      ]),
    ).toEqual({ functionsFound: 5, functionsHit: 4, linesFound: 30, linesHit: 23 });
  });
});

describe("adjustCoverageRecordForSource", () => {
  test("subtracts LCOV lines explicitly ignored in source", () => {
    const source = [
      "const covered = true;",
      "/* c8 ignore next 2 -- type-only declarations */",
      "declare private readonly value: string;",
      "constructor(",
      "const alsoCovered = true;",
    ].join("\n");

    expect(
      adjustCoverageRecordForSource(
        source,
        { functionsFound: 0, functionsHit: 0, linesFound: 4, linesHit: 2 },
        new Map([
          [1, 1],
          [3, 0],
          [4, 0],
          [5, 1],
        ]),
      ),
    ).toEqual({ functionsFound: 0, functionsHit: 0, linesFound: 2, linesHit: 2 });
  });
});

describe("isCoverageTarget", () => {
  test("counts executable entrypoints and composition roots", () => {
    expect(isCoverageTarget("apps/server/src/serverRuntime.ts")).toBe(true);
    expect(isCoverageTarget("apps/client/src/app/createApp.ts")).toBe(true);
    expect(isCoverageTarget("apps/client/src/game/Game.ts")).toBe(true);
  });

  test("excludes config, type-only files, re-export shims, and thin browser wiring", () => {
    expect(isCoverageTarget("apps/server/drizzle.config.ts")).toBe(false);
    expect(isCoverageTarget("apps/client/src/game/types.ts")).toBe(false);
    expect(isCoverageTarget("packages/engine/src/index.ts")).toBe(false);
    expect(isCoverageTarget("apps/client/src/main.ts")).toBe(false);
    expect(isCoverageTarget("apps/client/src/preview-entry.ts")).toBe(false);
    expect(isCoverageTarget("apps/server/src/index.ts")).toBe(false);
  });
});
