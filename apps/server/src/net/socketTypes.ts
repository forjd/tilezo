import type { AvatarAppearance } from "@tilezo/protocol";

export type SocketData = {
  userId: string;
  username?: string;
  roomId?: string;
  appearance?: AvatarAppearance;
};
