import type { RoomLayout, TilePosition } from "@tilezo/engine";
import type { AvatarAppearance, RoomItem, RoomUserSnapshot } from "@tilezo/protocol";

export type RoomUser = {
  id: string;
  username: string;
  position: TilePosition;
  appearance: AvatarAppearance;
  connectionId?: string;
};

export type RoomSnapshot = {
  roomId: string;
  users: RoomUserSnapshot[];
  tiles: RoomLayout["tiles"];
  items: RoomItem[];
};
