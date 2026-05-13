import type { AvatarAppearance } from "@tilezo/protocol";

export type SocketData = {
  userId: string;
  username?: string;
  roomId?: string;
  appearance?: AvatarAppearance;
  rateLimits?: Partial<Record<RateLimitedMessageKind, RateLimitState>>;
  lastTypingState?: boolean;
};

export type RateLimitedMessageKind = "movement" | "chat" | "typing" | "default";

export type RateLimitState = {
  tokens: number;
  updatedAt: number;
};
