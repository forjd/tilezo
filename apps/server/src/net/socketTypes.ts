import type { AvatarAppearance } from "@tilezo/protocol";

export type SocketData = {
  userId: string;
  username?: string;
  connectionId?: string;
  roomId?: string;
  resumeRoomId?: string;
  appearance?: AvatarAppearance;
  rateLimits?: Partial<Record<RateLimitedMessageKind, RateLimitState>>;
  lastTypingState?: boolean;
};

export type RateLimitedMessageKind = "movement" | "chat" | "typing" | "default";

export type RateLimitState = {
  tokens: number;
  updatedAt: number;
};
