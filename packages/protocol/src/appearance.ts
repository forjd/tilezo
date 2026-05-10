export const AVATAR_HAIR_STYLES = ["short", "side-part", "bob"] as const;
export const AVATAR_SHIRT_STYLES = ["crew", "hoodie"] as const;
export const AVATAR_PANTS_STYLES = ["straight", "wide"] as const;
export const AVATAR_SHOE_STYLES = ["boots", "sneakers"] as const;

export type AvatarHairStyle = (typeof AVATAR_HAIR_STYLES)[number];
export type AvatarShirtStyle = (typeof AVATAR_SHIRT_STYLES)[number];
export type AvatarPantsStyle = (typeof AVATAR_PANTS_STYLES)[number];
export type AvatarShoeStyle = (typeof AVATAR_SHOE_STYLES)[number];

export type AvatarAppearance = {
  hair: AvatarHairStyle;
  hairColor: string;
  skinTone: string;
  shirt: AvatarShirtStyle;
  shirtColor: string;
  pants: AvatarPantsStyle;
  pantsColor: string;
  shoes: AvatarShoeStyle;
  shoesColor: string;
};

export const DEFAULT_AVATAR_APPEARANCE: AvatarAppearance = {
  hair: "short",
  hairColor: "#7a4424",
  skinTone: "#f2c097",
  shirt: "crew",
  shirtColor: "#2f5f7f",
  pants: "straight",
  pantsColor: "#d2c294",
  shoes: "boots",
  shoesColor: "#5b4218",
};
