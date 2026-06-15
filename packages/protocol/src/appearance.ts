export const AVATAR_HAIR_STYLES = [
  "short",
  "side-part",
  "bob",
  "curls",
  "buzz",
  "afro",
  "ponytail",
  "braids",
  "undercut",
  "waves",
  "bun",
  "pixie",
  "mohawk",
  "locs",
] as const;
export const AVATAR_SHIRT_STYLES = [
  "crew",
  "hoodie",
  "jacket",
  "striped",
  "tee",
  "tank",
  "sweater",
  "vest",
  "blazer",
  "overshirt",
  "polo",
  "workwear",
] as const;
export const AVATAR_PANTS_STYLES = [
  "straight",
  "wide",
  "tapered",
  "skirt",
  "shorts",
  "cargo",
  "joggers",
  "pleated-skirt",
  "leggings",
  "cuffed",
] as const;
export const AVATAR_SHOE_STYLES = [
  "boots",
  "sneakers",
  "high-tops",
  "flats",
  "loafers",
  "sandals",
  "platforms",
  "slip-ons",
  "work-boots",
  "runners",
] as const;
export const AVATAR_HAIR_COLORS = [
  "#3b2418",
  "#6f3f22",
  "#7a4424",
  "#8b4a24",
  "#9a5a2d",
  "#c99743",
  "#1f2326",
  "#121416",
  "#4a2b1b",
  "#a84f2a",
  "#d47832",
  "#d9b45f",
  "#b8a789",
  "#7f8588",
  "#5b3f6f",
  "#2f6f6a",
] as const;
export const AVATAR_SKIN_TONES = [
  "#6f4637",
  "#8f5f45",
  "#a86c4d",
  "#b77a58",
  "#c88963",
  "#d59a73",
  "#e4ad84",
  "#f2c097",
  "#f6d7b8",
  "#f3dfc8",
] as const;
export const AVATAR_SHIRT_COLORS = [
  "#24546f",
  "#2f5f7f",
  "#2f6f5f",
  "#7f3b44",
  "#d69a35",
  "#ece3cf",
  "#1f2933",
  "#3f4d5c",
  "#5a4b7f",
  "#7a5a2d",
  "#9f4f3f",
  "#b7aa78",
  "#d85f45",
  "#4c8a6a",
  "#f0d06a",
  "#f5f0e5",
] as const;
export const AVATAR_PANTS_COLORS = [
  "#3f4d5c",
  "#77684b",
  "#b7aa78",
  "#d2c294",
  "#503d33",
  "#d8d0ba",
  "#222a31",
  "#2f3b40",
  "#394c6a",
  "#5b5144",
  "#6b3f36",
  "#87928a",
  "#a68b5b",
  "#efe6d5",
] as const;
export const AVATAR_SHOE_COLORS = [
  "#2a2118",
  "#5b4218",
  "#6c3328",
  "#2f3b40",
  "#e5ded1",
  "#151719",
  "#47362d",
  "#7d6a4f",
  "#9f4f3f",
  "#d8d0ba",
] as const;

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

// Coerces an untrusted/legacy appearance value into a valid one field-by-field, replacing
// only the fields that are not current enum members with the default. Used at every DB read
// boundary so a retired or hand-edited style/color cannot poison a room snapshot (the client
// drops an entire message whose embedded appearance fails strict validation) or render a
// faceless avatar. Writes still go through the strict `avatarAppearanceSchema`.
export function sanitizeAppearance(value: unknown): AvatarAppearance {
  const source = (typeof value === "object" && value !== null ? value : {}) as Partial<
    Record<keyof AvatarAppearance, unknown>
  >;
  return {
    hair: coerceMember(AVATAR_HAIR_STYLES, source.hair, DEFAULT_AVATAR_APPEARANCE.hair),
    hairColor: coerceMember(
      AVATAR_HAIR_COLORS,
      source.hairColor,
      DEFAULT_AVATAR_APPEARANCE.hairColor,
    ),
    skinTone: coerceMember(AVATAR_SKIN_TONES, source.skinTone, DEFAULT_AVATAR_APPEARANCE.skinTone),
    shirt: coerceMember(AVATAR_SHIRT_STYLES, source.shirt, DEFAULT_AVATAR_APPEARANCE.shirt),
    shirtColor: coerceMember(
      AVATAR_SHIRT_COLORS,
      source.shirtColor,
      DEFAULT_AVATAR_APPEARANCE.shirtColor,
    ),
    pants: coerceMember(AVATAR_PANTS_STYLES, source.pants, DEFAULT_AVATAR_APPEARANCE.pants),
    pantsColor: coerceMember(
      AVATAR_PANTS_COLORS,
      source.pantsColor,
      DEFAULT_AVATAR_APPEARANCE.pantsColor,
    ),
    shoes: coerceMember(AVATAR_SHOE_STYLES, source.shoes, DEFAULT_AVATAR_APPEARANCE.shoes),
    shoesColor: coerceMember(
      AVATAR_SHOE_COLORS,
      source.shoesColor,
      DEFAULT_AVATAR_APPEARANCE.shoesColor,
    ),
  };
}

function coerceMember<T extends readonly string[]>(
  values: T,
  candidate: unknown,
  fallback: T[number],
): T[number] {
  return (
    typeof candidate === "string" && (values as readonly string[]).includes(candidate)
      ? candidate
      : fallback
  ) as T[number];
}

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
