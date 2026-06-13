import { describe, expect, test } from "bun:test";
import { parseLcov, percentage, totalCoverage } from "./check-coverage";

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
