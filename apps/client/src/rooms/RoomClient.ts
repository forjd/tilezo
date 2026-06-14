import { apiUrl } from "../config";

export type RoomTemplateSummary = {
  id: string;
  name: string;
  width: number;
  height: number;
  defaultCapacity: number;
  doorOptions: { label: string; y: number }[];
};

export type CreateRoomRequest = {
  name: string;
  description: string;
  templateId: string;
  visibility: "public" | "private";
  access: "open" | "knock";
  capacity: number;
  doorY: number;
};

export type CreatedRoom = {
  roomId: string;
  balance?: number;
  room: {
    id: string;
    name: string;
    userCount: number;
    joined: boolean;
  };
};

export async function listRoomTemplates(): Promise<RoomTemplateSummary[]> {
  const response = await fetch(apiUrl("/room-templates"));
  const body = await readJson<
    { templates?: RoomTemplateSummary[] } | { error?: { message?: string } }
  >(response);

  if (!response.ok) {
    throw new Error(body && "error" in body ? body.error?.message : "Room templates failed");
  }

  return Array.isArray((body as { templates?: unknown }).templates)
    ? (body as { templates: RoomTemplateSummary[] }).templates
    : [];
}

export async function createRoom(room: CreateRoomRequest): Promise<CreatedRoom> {
  const response = await fetch(apiUrl("/rooms"), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(room),
  });
  const body = await readJson<CreatedRoom | { error?: { message?: string } }>(response);

  if (!response.ok) {
    throw new Error(body && "error" in body ? body.error?.message : "Room creation failed");
  }

  return body as CreatedRoom;
}


async function readJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}
