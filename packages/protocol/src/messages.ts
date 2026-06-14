import type { RoomTile, TilePosition } from "@tilezo/engine";
import type { AvatarAppearance } from "./appearance";

export type RoomJoinMessage = {
  type: "room.join";
  roomId: string;
};

export type RoomListRequestMessage = {
  type: "room.list.request";
};

export type AvatarMoveRequestMessage = {
  type: "avatar.move.request";
  target: TilePosition;
};

export type ChatSayMessage = {
  type: "chat.say";
  text: string;
};

export type ChatTypingMessage = {
  type: "chat.typing";
  isTyping: boolean;
};

export type DirectMessageSendMessage = {
  type: "dm.send";
  toUserId: string;
  text: string;
};

export type DirectMessageTypingMessage = {
  type: "dm.typing";
  toUserId: string;
  isTyping: boolean;
};

export type DirectMessageReadMessage = {
  type: "dm.read";
  friendId: string;
};

export type AvatarAppearanceUpdateMessage = {
  type: "avatar.appearance.update";
  appearance: AvatarAppearance;
};

export type PingMessage = {
  type: "ping";
  sentAt: string;
};

export type ClientMessage =
  | RoomJoinMessage
  | RoomListRequestMessage
  | AvatarMoveRequestMessage
  | ChatSayMessage
  | ChatTypingMessage
  | DirectMessageSendMessage
  | DirectMessageTypingMessage
  | DirectMessageReadMessage
  | AvatarAppearanceUpdateMessage
  | PingMessage;

export type ConnectedMessage = {
  type: "connected";
  userId: string;
};

export type RoomUserSnapshot = {
  id: string;
  username: string;
  position: TilePosition;
  appearance: AvatarAppearance;
  movementPath?: TilePosition[];
};

export type RoomSnapshotMessage = {
  type: "room.snapshot";
  roomId: string;
  users: RoomUserSnapshot[];
  tiles: RoomTile[];
};

export type PublicRoomSummary = {
  id: string;
  name: string;
  userCount: number;
  joined: boolean;
};

export type RoomListMessage = {
  type: "room.list";
  rooms: PublicRoomSummary[];
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

export type AvatarAppearanceUpdatedMessage = {
  type: "avatar.appearance.updated";
  userId: string;
  appearance: AvatarAppearance;
};

export type ChatMessage = {
  type: "chat.message";
  userId: string;
  username: string;
  text: string;
  sentAt: string;
};

export type ChatTypingStatusMessage = {
  type: "chat.typing";
  userId: string;
  username: string;
  isTyping: boolean;
};

export type DirectMessage = {
  type: "dm.message";
  id: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  sentAt: string;
  readAt?: string;
};

export type DirectMessageTypingStatusMessage = {
  type: "dm.typing";
  fromUserId: string;
  toUserId: string;
  isTyping: boolean;
};

export type DirectMessageReadReceiptMessage = {
  type: "dm.read";
  readerUserId: string;
  otherUserId: string;
  messageIds: string[];
  readAt: string;
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
  | RoomListMessage
  | UserJoinedMessage
  | UserLeftMessage
  | AvatarMovedMessage
  | AvatarAppearanceUpdatedMessage
  | ChatMessage
  | ChatTypingStatusMessage
  | DirectMessage
  | DirectMessageTypingStatusMessage
  | DirectMessageReadReceiptMessage
  | PongMessage
  | ErrorMessage;
