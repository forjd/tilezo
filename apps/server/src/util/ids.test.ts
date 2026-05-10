import { describe, expect, test } from "bun:test";
import { createId } from "./ids";

describe("createId", () => {
  test("prefixes generated UUIDs", () => {
    expect(createId("user")).toMatch(
      /^user_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
