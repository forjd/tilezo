export type TilePosition = {
  x: number;
  y: number;
};

export type RoomTile = TilePosition & {
  z: number;
  walkable: boolean;
};

export type RoomLayout = {
  id: string;
  name: string;
  width: number;
  height: number;
  spawn: TilePosition;
  tiles: RoomTile[];
};
