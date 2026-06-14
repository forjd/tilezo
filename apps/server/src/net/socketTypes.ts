import type { AvatarAppearance } from "@tilezo/protocol";

export type SocketData = {
  userId: string;
  username?: string;
  connectionId?: string;
  roomId?: string;
  resumeRoomId?: string;
  appearance?: AvatarAppearance;
  dollars?: number;
  rateLimits?: Partial<Record<RateLimitedMessageKind, RateLimitState>>;
  lastTypingState?: boolean;
  lastDirectTypingStates?: Map<string, boolean>;
};

export type RateLimitedMessageKind = "movement" | "chat" | "typing" | "dm" | "default";

export type RateLimitState = {
  tokens: number;
  updatedAt: number;
};
