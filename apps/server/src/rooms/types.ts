import type { RoomLayout, TilePosition } from "@tilezo/engine";
import type { AvatarAppearance, RoomUserSnapshot } from "@tilezo/protocol";

export type RoomUser = {
  id: string;
  username: string;
  position: TilePosition;
  appearance: AvatarAppearance;
};

export type RoomSnapshot = {
  roomId: string;
  users: RoomUserSnapshot[];
  tiles: RoomLayout["tiles"];
};
