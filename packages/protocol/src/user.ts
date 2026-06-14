import type { AvatarAppearance } from "./appearance";

export type AuthUser = {
  id: string;
  username: string;
  appearance: AvatarAppearance;
  dollars: number;
};
