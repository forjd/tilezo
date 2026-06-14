import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_API_URL } from "../assets";
import { createRoom, listRoomTemplates } from "./RoomClient";

const originalFetch = globalThis.fetch;
const originalProcess = Object.getOwnPropertyDescriptor(globalThis, "process");
const originalPublicApiUrl = Bun.env.PUBLIC_API_URL;
type FetchArgs = Parameters<typeof fetch>;

describe("RoomClient", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreProcess();
    restorePublicApiUrl();
  });

  test("loads room creation templates", async () => {
    delete Bun.env.PUBLIC_API_URL;
    const templates = [
      {
        id: "compact-studio",
        name: "Compact Studio",
        width: 7,
        height: 7,
        defaultCapacity: 20,
        doorOptions: [{ label: "Middle entrance", y: 3 }],
      },
    ];
    const requests: string[] = [];
    globalThis.fetch = (async (url: FetchArgs[0]) => {
      requests.push(String(url));
      return Response.json({ templates });
    }) as unknown as typeof fetch;

    await expect(listRoomTemplates()).resolves.toEqual(templates);
    expect(requests).toEqual([`${DEFAULT_API_URL}/room-templates`]);
  });

  test("creates rooms with the bearer token", async () => {
    delete Bun.env.PUBLIC_API_URL;
    const request = {
      name: "Tile Lab",
      description: "Build space",
      templateId: "compact-studio",
      visibility: "private" as const,
      access: "knock" as const,
      capacity: 12,
      doorY: 3,
    };
    const created = {
      roomId: "room_1",
      room: { id: "room_1", name: "Tile Lab", userCount: 0, joined: false },
    };
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: FetchArgs[0], init?: FetchArgs[1]) => {
      requests.push({ url: String(url), init });
      return Response.json(created, { status: 201 });
    }) as unknown as typeof fetch;

    await expect(createRoom(request)).resolves.toEqual(created);

    expect(requests).toEqual([
      {
        url: `${DEFAULT_API_URL}/rooms`,
        init: {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        },
      },
    ]);
  });

  test("uses configured API URL and throws server errors", async () => {
    Bun.env.PUBLIC_API_URL = "http://localhost:4567";
    const requests: string[] = [];
    globalThis.fetch = (async (url: FetchArgs[0]) => {
      requests.push(String(url));
      return Response.json({ error: { message: "Nope" } }, { status: 400 });
    }) as unknown as typeof fetch;

    await expect(listRoomTemplates()).rejects.toThrow("Nope");
    expect(requests).toEqual(["http://localhost:4567/room-templates"]);
  });

  test("returns an empty template list when the payload is absent", async () => {
    globalThis.fetch = (async () => Response.json({})) as unknown as typeof fetch;

    await expect(listRoomTemplates()).resolves.toEqual([]);
  });

  test("throws fallback errors when room error responses are malformed", async () => {
    globalThis.fetch = (async () =>
      new Response("not json", { status: 500 })) as unknown as typeof fetch;

    await expect(listRoomTemplates()).rejects.toThrow("Room templates failed");
    await expect(
      createRoom({
        name: "Tile Lab",
        description: "Build space",
        templateId: "compact-studio",
        visibility: "public",
        access: "open",
        capacity: 12,
        doorY: 3,
      }),
    ).rejects.toThrow("Room creation failed");
  });
});

function restorePublicApiUrl(): void {
  if (originalPublicApiUrl === undefined) {
    delete Bun.env.PUBLIC_API_URL;
  } else {
    Bun.env.PUBLIC_API_URL = originalPublicApiUrl;
  }
}

function restoreProcess(): void {
  if (originalProcess) {
    Object.defineProperty(globalThis, "process", originalProcess);
  }
}
