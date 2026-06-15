import { describe, expect, test } from "bun:test";
import type { RoomItem } from "@tilezo/protocol";
import { Graphics } from "pixi.js";
import { Furniture } from "./Furniture";

describe("Furniture", () => {
  test("draws all client-side sprite variants and clones item state", () => {
    for (const itemType of [
      "woven_rug",
      "crate_table",
      "low_stool",
      "reed_divider",
      "glass_lamp",
    ] as const) {
      const furniture = new Furniture(roomItem({ itemType, state: { on: true } }));

      expect(furniture.view.children).toHaveLength(2);
      expect(furniture.view.children.every((child) => child instanceof Graphics)).toBe(true);

      furniture.destroy();
    }

    const item = roomItem({ itemType: "glass_lamp", state: { on: false } });
    const furniture = new Furniture(item);
    item.state.on = true;
    expect(furniture.item.state.on).toBe(false);

    const returned = furniture.item;
    returned.state.on = true;
    expect(furniture.item.state.on).toBe(false);

    furniture.update(roomItem({ itemType: "glass_lamp", x: 2, y: 1, z: 1, state: { on: true } }));
    expect(furniture.item).toMatchObject({ itemType: "glass_lamp", x: 2, y: 1, z: 1 });
    expect(furniture.item.state.on).toBe(true);
    expect(furniture.view.zIndex).toBe(4);
    expect(furniture.view.children).toHaveLength(2);

    furniture.destroy();
  });

  test("draws a missing-item placeholder for unknown furniture types", () => {
    const furniture = new Furniture(roomItem({ itemType: "unknown_item" }));

    expect(furniture.view.children).toHaveLength(1);
    expect(furniture.view.children[0]).toBeInstanceOf(Graphics);

    furniture.destroy();
  });
});

function roomItem(patch: Partial<RoomItem> = {}): RoomItem {
  return {
    id: "item_1",
    itemType: "crate_table",
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    state: {},
    ...patch,
  };
}
