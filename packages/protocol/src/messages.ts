import type { RoomTile, TilePosition } from "@tilezo/engine";
import type { AvatarAppearance } from "./appearance";
import type { RoomItem } from "./furniture";

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

export type DirectMessageEditMessage = {
  type: "dm.edit";
  messageId: string;
  text: string;
};

export type DirectMessageDeleteMessage = {
  type: "dm.delete";
  messageId: string;
};

export type AvatarAppearanceUpdateMessage = {
  type: "avatar.appearance.update";
  appearance: AvatarAppearance;
};

export type RoomItemPlaceRequestMessage = {
  type: "room.item.place.request";
  itemType: string;
  position: TilePosition;
  rotation: number;
};

export type RoomItemMoveRequestMessage = {
  type: "room.item.move.request";
  itemId: string;
  position: TilePosition;
  rotation: number;
};

export type RoomItemPickupRequestMessage = {
  type: "room.item.pickup.request";
  itemId: string;
};

export type RoomItemInteractRequestMessage = {
  type: "room.item.interact.request";
  itemId: string;
  action: string;
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
  | DirectMessageEditMessage
  | DirectMessageDeleteMessage
  | AvatarAppearanceUpdateMessage
  | RoomItemPlaceRequestMessage
  | RoomItemMoveRequestMessage
  | RoomItemPickupRequestMessage
  | RoomItemInteractRequestMessage
  | PingMessage;

export type ConnectedMessage = {
  type: "connected";
  userId: string;
  dollars: number;
};

export type InventoryItem = {
  itemType: string;
  quantity: number;
};

export type BalanceUpdatedMessage = {
  type: "balance.updated";
  dollars: number;
};

export type InventoryUpdatedMessage = {
  type: "inventory.updated";
  items: InventoryItem[];
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
  items: RoomItem[];
  canEditItems: boolean;
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

export type RoomItemPlacedMessage = {
  type: "room.item.placed";
  item: RoomItem;
};

export type RoomItemMovedMessage = {
  type: "room.item.moved";
  item: RoomItem;
};

export type RoomItemPickedUpMessage = {
  type: "room.item.picked_up";
  itemId: string;
};

export type RoomItemStateUpdatedMessage = {
  type: "room.item.state_updated";
  item: RoomItem;
};

export type DirectMessage = {
  type: "dm.message";
  id: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  sentAt: string;
  readAt?: string;
  editedAt?: string;
  deletedAt?: string;
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

export type DirectMessageEditedMessage = {
  type: "dm.edited";
  id: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  editedAt: string;
};

export type DirectMessageDeletedMessage = {
  type: "dm.deleted";
  id: string;
  fromUserId: string;
  toUserId: string;
  deletedAt: string;
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
  | RoomItemPlacedMessage
  | RoomItemMovedMessage
  | RoomItemPickedUpMessage
  | RoomItemStateUpdatedMessage
  | DirectMessage
  | DirectMessageTypingStatusMessage
  | DirectMessageReadReceiptMessage
  | DirectMessageEditedMessage
  | DirectMessageDeletedMessage
  | BalanceUpdatedMessage
  | InventoryUpdatedMessage
  | PongMessage
  | ErrorMessage;
