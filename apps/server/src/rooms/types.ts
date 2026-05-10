import type { RoomLayout, TilePosition } from "@tilezo/engine";
import type { RoomUserSnapshot } from "@tilezo/protocol";

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
