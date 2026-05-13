import { createRectRoomLayoutWithDoorTile, type RoomLayout } from "@tilezo/engine";
import type { RoomAccess, RoomVisibility } from "../db/persistence";

export type RoomCreationTemplate = {
  id: string;
  name: string;
  width: number;
  height: number;
  defaultDoorY: number;
  defaultCapacity: number;
  blocked?: { x: number; y: number }[];
};

export type RoomTemplateSummary = {
  id: string;
  name: string;
  width: number;
  height: number;
  defaultCapacity: number;
  doorOptions: { label: string; y: number }[];
};

export type CreateRoomInput = {
  name: string;
  description: string;
  templateId: string;
  visibility: RoomVisibility;
  access: RoomAccess;
  capacity: number;
  doorY: number;
};

export type ParseCreateRoomResult =
  | { ok: true; value: CreateRoomInput }
  | { ok: false; message: string };

export const ROOM_NAME_MAX_LENGTH = 40;
export const ROOM_DESCRIPTION_MAX_LENGTH = 160;
export const ROOM_MIN_CAPACITY = 2;
export const ROOM_MAX_CAPACITY = 50;

const ROOM_CREATION_TEMPLATES: RoomCreationTemplate[] = [
  {
    id: "compact-studio",
    name: "Compact Studio",
    width: 7,
    height: 7,
    defaultDoorY: 3,
    defaultCapacity: 20,
  },
  {
    id: "wide-lounge",
    name: "Wide Lounge",
    width: 10,
    height: 6,
    defaultDoorY: 2,
    defaultCapacity: 30,
    blocked: [
      { x: 8, y: 0 },
      { x: 9, y: 0 },
      { x: 9, y: 1 },
    ],
  },
  {
    id: "corner-suite",
    name: "Corner Suite",
    width: 8,
    height: 8,
    defaultDoorY: 5,
    defaultCapacity: 25,
    blocked: [
      { x: 6, y: 0 },
      { x: 7, y: 0 },
      { x: 7, y: 1 },
      { x: 0, y: 7 },
    ],
  },
];

export function listRoomCreationTemplates(): RoomTemplateSummary[] {
  return ROOM_CREATION_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    width: template.width,
    height: template.height,
    defaultCapacity: template.defaultCapacity,
    doorOptions: doorOptionsForTemplate(template),
  }));
}

export function parseCreateRoomInput(input: unknown): ParseCreateRoomResult {
  if (!input || typeof input !== "object") {
    return { ok: false, message: "Room details are required" };
  }

  const body = input as Record<string, unknown>;
  const template = getRoomCreationTemplate(readString(body.templateId));

  if (!template) {
    return { ok: false, message: "Choose a valid room layout" };
  }

  const name = readString(body.name).slice(0, ROOM_NAME_MAX_LENGTH);

  if (!name) {
    return { ok: false, message: "Room name is required" };
  }

  const description = readString(body.description).slice(0, ROOM_DESCRIPTION_MAX_LENGTH);
  const visibility = body.visibility === "private" ? "private" : "public";
  const access = body.access === "knock" ? "knock" : "open";
  const capacity = clampNumber(
    body.capacity,
    ROOM_MIN_CAPACITY,
    ROOM_MAX_CAPACITY,
    template.defaultCapacity,
  );
  const doorY = clampNumber(body.doorY, 0, template.height - 1, template.defaultDoorY);

  return {
    ok: true,
    value: {
      name,
      description,
      templateId: template.id,
      visibility,
      access,
      capacity,
      doorY,
    },
  };
}

export function createRoomLayoutFromTemplate(roomId: string, input: CreateRoomInput): RoomLayout {
  const template = getRoomCreationTemplate(input.templateId);

  if (!template) {
    throw new Error(`Unknown room template: ${input.templateId}`);
  }

  return createRectRoomLayoutWithDoorTile(
    roomId,
    input.name,
    template.width,
    template.height,
    input.doorY,
    template.blocked ?? [],
  );
}

function getRoomCreationTemplate(templateId: string): RoomCreationTemplate | undefined {
  return ROOM_CREATION_TEMPLATES.find((template) => template.id === templateId);
}

function doorOptionsForTemplate(template: RoomCreationTemplate): { label: string; y: number }[] {
  const options = new Map<number, string>();
  options.set(1, "Top entrance");
  options.set(template.defaultDoorY, "Middle entrance");
  options.set(template.height - 2, "Bottom entrance");

  return [...options.entries()]
    .map(([y, label]) => ({
      label,
      y: Math.min(Math.max(y, 0), template.height - 1),
    }))
    .sort((left, right) => left.y - right.y);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}
