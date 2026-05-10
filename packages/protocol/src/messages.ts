import type { RoomTile, TilePosition } from "@habbo/engine";

export type RoomJoinMessage = {
  type: "room.join";
  roomId: string;
  username: string;
};

export type AvatarMoveRequestMessage = {
  type: "avatar.move.request";
  target: TilePosition;
};

export type ChatSayMessage = {
  type: "chat.say";
  text: string;
};

export type PingMessage = {
  type: "ping";
  sentAt: string;
};

export type ClientMessage =
  | RoomJoinMessage
  | AvatarMoveRequestMessage
  | ChatSayMessage
  | PingMessage;

export type ConnectedMessage = {
  type: "connected";
  userId: string;
};

export type RoomUserSnapshot = {
  id: string;
  username: string;
  position: TilePosition;
};

export type RoomSnapshotMessage = {
  type: "room.snapshot";
  roomId: string;
  users: RoomUserSnapshot[];
  tiles: RoomTile[];
};

export type UserJoinedMessage = {
  type: "user.joined";
  user: RoomUserSnapshot;
};

export type UserLeftMessage = {
  type: "user.left";
  userId: string;
};

export type AvatarMovedMessage = {
  type: "avatar.moved";
  userId: string;
  path: TilePosition[];
};

export type ChatMessage = {
  type: "chat.message";
  userId: string;
  username: string;
  text: string;
  sentAt: string;
};

export type PongMessage = {
  type: "pong";
  sentAt: string;
};

export type ErrorMessage = {
  type: "error";
  code: string;
  message: string;
};

export type ServerMessage =
  | ConnectedMessage
  | RoomSnapshotMessage
  | UserJoinedMessage
  | UserLeftMessage
  | AvatarMovedMessage
  | ChatMessage
  | PongMessage
  | ErrorMessage;
