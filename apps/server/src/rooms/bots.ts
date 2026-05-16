import type { AvatarAppearance, ServerMessage } from "@tilezo/protocol";
import type { Room } from "./Room";
import type { RoomManager } from "./RoomManager";

export type RoomBotDefinition = {
  id: string;
  username: string;
  roomIds: readonly string[];
  appearance: AvatarAppearance;
  lines: readonly string[];
};

type Publish = (topic: string, message: ServerMessage) => void;

const BOT_ACTION_INTERVAL_MS = 8_000;

export const DEFAULT_ROOM_BOTS: readonly RoomBotDefinition[] = [
  {
    id: "bot:lobby-guide",
    username: "Tilezo Guide",
    roomIds: ["lobby"],
    appearance: {
      hair: "side-part",
      hairColor: "#3b2418",
      skinTone: "#d59a73",
      shirt: "crew",
      shirtColor: "#2f6f5f",
      pants: "straight",
      pantsColor: "#3f4d5c",
      shoes: "boots",
      shoesColor: "#2a2118",
    },
    lines: [
      "Welcome in. Try a tile, then say hello.",
      "Rooms are server-authoritative here.",
      "The room list updates as people arrive.",
    ],
  },
  {
    id: "bot:studio-host",
    username: "Studio Host",
    roomIds: ["studio"],
    appearance: {
      hair: "bob",
      hairColor: "#1f2326",
      skinTone: "#b77a58",
      shirt: "hoodie",
      shirtColor: "#7f3b44",
      pants: "wide",
      pantsColor: "#77684b",
      shoes: "sneakers",
      shoesColor: "#2f3b40",
    },
    lines: [
      "This studio is a good place to test movement.",
      "Chat bubbles should stay readable above avatars.",
      "Server ticks keep the room state honest.",
    ],
  },
];

export function seedRoomBots(
  room: Room,
  roomId: string,
  bots: readonly RoomBotDefinition[] = DEFAULT_ROOM_BOTS,
): void {
  for (const bot of botsForRoom(roomId, bots)) {
    if (room.hasUser(bot.id)) {
      continue;
    }

    room.join({
      id: bot.id,
      username: bot.username,
      appearance: bot.appearance,
    });
  }
}

export class RoomBotController {
  private readonly nextActionAt = new Map<string, number>();

  constructor(
    private readonly options: {
      rooms: RoomManager;
      publish: Publish;
      bots?: readonly RoomBotDefinition[];
      now?: () => number;
      random?: () => number;
    },
  ) {}

  tick(): void {
    const now = this.options.now?.() ?? Date.now();
    const random = this.options.random ?? Math.random;
    const bots = this.options.bots ?? DEFAULT_ROOM_BOTS;

    for (const room of this.options.rooms.listActiveRooms()) {
      for (const bot of botsForRoom(room.id, bots)) {
        if (!room.hasUser(bot.id) || !isReady(bot.id, now, this.nextActionAt)) {
          continue;
        }

        this.nextActionAt.set(bot.id, now + BOT_ACTION_INTERVAL_MS + Math.floor(random() * 2_000));

        if (random() < 0.45) {
          this.say(room, bot, random);
        } else {
          this.move(room, bot, random);
        }
      }
    }
  }

  private say(room: Room, bot: RoomBotDefinition, random: () => number): void {
    const text = pick(bot.lines, random);

    this.options.publish(roomTopic(room.id), {
      type: "chat.message",
      userId: bot.id,
      username: bot.username,
      text,
      sentAt: new Date(this.options.now?.() ?? Date.now()).toISOString(),
    });
  }

  private move(room: Room, bot: RoomBotDefinition, random: () => number): void {
    const target = pick(room.getWalkableTiles(), random);
    const path = room.moveUser(bot.id, target);

    if (!path || path.length < 2) {
      return;
    }

    this.options.publish(roomTopic(room.id), {
      type: "avatar.moved",
      userId: bot.id,
      path,
    });
  }
}

function botsForRoom(
  roomId: string,
  bots: readonly RoomBotDefinition[],
): readonly RoomBotDefinition[] {
  return bots.filter((bot) => bot.roomIds.includes(roomId));
}

function isReady(botId: string, now: number, nextActionAt: Map<string, number>): boolean {
  return now >= (nextActionAt.get(botId) ?? 0);
}

function pick<T>(values: readonly T[], random: () => number): T {
  const index = Math.max(0, Math.min(values.length - 1, Math.floor(random() * values.length)));
  return values[index] as T;
}

function roomTopic(roomId: string): string {
  return `room:${roomId}`;
}
