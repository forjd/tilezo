import type { RoomLayout, TilePosition } from "@habbo/engine";
import type { RoomUserSnapshot } from "@habbo/protocol";

export type RoomUser = {
  id: string;
  username: string;
  position: TilePosition;
};

export type RoomSnapshot = {
  roomId: string;
  users: RoomUserSnapshot[];
  tiles: RoomLayout["tiles"];
};
