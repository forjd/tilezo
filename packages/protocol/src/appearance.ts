export const AVATAR_HAIR_STYLES = ["short", "side-part", "bob", "curls", "buzz"] as const;
export const AVATAR_SHIRT_STYLES = ["crew", "hoodie", "jacket", "striped"] as const;
export const AVATAR_PANTS_STYLES = ["straight", "wide", "tapered", "skirt"] as const;
export const AVATAR_SHOE_STYLES = ["boots", "sneakers", "high-tops", "flats"] as const;
export const AVATAR_HAIR_COLORS = [
  "#3b2418",
  "#6f3f22",
  "#7a4424",
  "#8b4a24",
  "#9a5a2d",
  "#c99743",
  "#1f2326",
] as const;
export const AVATAR_SKIN_TONES = ["#8f5f45", "#b77a58", "#d59a73", "#f2c097", "#f6d7b8"] as const;
export const AVATAR_SHIRT_COLORS = [
  "#24546f",
  "#2f5f7f",
  "#2f6f5f",
  "#7f3b44",
  "#d69a35",
  "#ece3cf",
] as const;
export const AVATAR_PANTS_COLORS = [
  "#3f4d5c",
  "#77684b",
  "#b7aa78",
  "#d2c294",
  "#503d33",
  "#d8d0ba",
] as const;
export const AVATAR_SHOE_COLORS = ["#2a2118", "#5b4218", "#6c3328", "#2f3b40", "#e5ded1"] as const;

export type AvatarHairStyle = (typeof AVATAR_HAIR_STYLES)[number];
export type AvatarShirtStyle = (typeof AVATAR_SHIRT_STYLES)[number];
export type AvatarPantsStyle = (typeof AVATAR_PANTS_STYLES)[number];
export type AvatarShoeStyle = (typeof AVATAR_SHOE_STYLES)[number];
export type AvatarHairColor = (typeof AVATAR_HAIR_COLORS)[number];
export type AvatarSkinTone = (typeof AVATAR_SKIN_TONES)[number];
export type AvatarShirtColor = (typeof AVATAR_SHIRT_COLORS)[number];
export type AvatarPantsColor = (typeof AVATAR_PANTS_COLORS)[number];
export type AvatarShoeColor = (typeof AVATAR_SHOE_COLORS)[number];

export type AvatarAppearance = {
  hair: AvatarHairStyle;
  hairColor: AvatarHairColor;
  skinTone: AvatarSkinTone;
  shirt: AvatarShirtStyle;
  shirtColor: AvatarShirtColor;
  pants: AvatarPantsStyle;
  pantsColor: AvatarPantsColor;
  shoes: AvatarShoeStyle;
  shoesColor: AvatarShoeColor;
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

export function createRandomAvatarAppearance(random: () => number = Math.random): AvatarAppearance {
  return {
    hair: pickRandom(AVATAR_HAIR_STYLES, random),
    hairColor: pickRandom(AVATAR_HAIR_COLORS, random),
    skinTone: pickRandom(AVATAR_SKIN_TONES, random),
    shirt: pickRandom(AVATAR_SHIRT_STYLES, random),
    shirtColor: pickRandom(AVATAR_SHIRT_COLORS, random),
    pants: pickRandom(AVATAR_PANTS_STYLES, random),
    pantsColor: pickRandom(AVATAR_PANTS_COLORS, random),
    shoes: pickRandom(AVATAR_SHOE_STYLES, random),
    shoesColor: pickRandom(AVATAR_SHOE_COLORS, random),
  };
}

function pickRandom<T extends readonly string[]>(values: T, random: () => number): T[number] {
  const value = random();
  const index = Number.isFinite(value)
    ? Math.max(0, Math.min(values.length - 1, Math.floor(value * values.length)))
    : 0;
  return values[index] as T[number];
}
