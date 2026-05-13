import { describe, expect, test } from "bun:test";
import {
  createRoomLayoutFromTemplate,
  listRoomCreationTemplates,
  parseCreateRoomInput,
  ROOM_DESCRIPTION_MAX_LENGTH,
  ROOM_MAX_CAPACITY,
  ROOM_NAME_MAX_LENGTH,
} from "./roomCreation";

describe("room creation templates", () => {
  test("exposes predefined layouts with door choices", () => {
    expect(listRoomCreationTemplates()).toEqual([
      expect.objectContaining({
        id: "compact-studio",
        name: "Compact Studio",
        defaultCapacity: 20,
        doorOptions: expect.arrayContaining([{ label: "Middle entrance", y: 3 }]),
      }),
      expect.objectContaining({ id: "wide-lounge" }),
      expect.objectContaining({ id: "corner-suite" }),
    ]);
  });

  test("validates and clamps submitted room details", () => {
    const parsed = parseCreateRoomInput({
      name: ` ${"Room".repeat(20)} `,
      description: "A".repeat(200),
      templateId: "compact-studio",
      visibility: "private",
      access: "knock",
      capacity: 200,
      doorY: 99,
    });

    expect(parsed).toEqual({
      ok: true,
      value: {
        name: "Room".repeat(20).slice(0, ROOM_NAME_MAX_LENGTH),
        description: "A".repeat(ROOM_DESCRIPTION_MAX_LENGTH),
        templateId: "compact-studio",
        visibility: "private",
        access: "knock",
        capacity: ROOM_MAX_CAPACITY,
        doorY: 6,
      },
    });
  });

  test("rejects blank names and unknown templates", () => {
    expect(parseCreateRoomInput({ name: "", templateId: "compact-studio" })).toEqual({
      ok: false,
      message: "Room name is required",
    });
    expect(parseCreateRoomInput({ name: "Room", templateId: "unknown" })).toEqual({
      ok: false,
      message: "Choose a valid room layout",
    });
  });

  test("creates a room layout from a valid template", () => {
    const parsed = parseCreateRoomInput({
      name: "Tile Lab",
      templateId: "wide-lounge",
      doorY: 1,
    });

    if (!parsed.ok) {
      throw new Error(parsed.message);
    }

    const layout = createRoomLayoutFromTemplate("room_1", parsed.value);

    expect(layout).toMatchObject({
      id: "room_1",
      name: "Tile Lab",
      width: 10,
      height: 6,
      spawn: { x: -1, y: 1 },
    });
    expect(layout.tiles).toContainEqual({ x: -1, y: 1, z: 0, walkable: true });
    expect(layout.tiles).toContainEqual({ x: 9, y: 0, z: 0, walkable: false });
  });
});
