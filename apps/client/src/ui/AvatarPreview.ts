import type { AvatarAppearance } from "@tilezo/protocol/appearance";

const AVATAR_PARTS = [
  "shadow",
  "left-leg",
  "right-leg",
  "left-shoe",
  "right-shoe",
  "torso",
  "left-arm",
  "right-arm",
  "head",
  "hair",
  "left-eye",
  "right-eye",
  "mouth",
] as const;

type AvatarPreviewPart = (typeof AVATAR_PARTS)[number];

export function createAvatarPreview(documentRef: Document): HTMLDivElement {
  const preview = documentRef.createElement("div");
  preview.className = "avatar-preview-drawn";
  preview.setAttribute("aria-hidden", "true");

  for (const part of AVATAR_PARTS) {
    const partElement = documentRef.createElement("div");
    partElement.className = `avatar-preview-part avatar-preview-${part}`;
    partElement.setAttribute("data-part", part);
    preview.append(partElement);
  }

  return preview;
}

export function updateAvatarPreview(preview: HTMLElement, appearance: AvatarAppearance): void {
  preview.dataset.hair = appearance.hair;
  preview.dataset.shirt = appearance.shirt;
  preview.dataset.pants = appearance.pants;
  preview.dataset.shoes = appearance.shoes;
  preview.style.setProperty("--avatar-skin", appearance.skinTone);
  preview.style.setProperty("--avatar-hair", appearance.hairColor);
  preview.style.setProperty("--avatar-shirt", appearance.shirtColor);
  preview.style.setProperty("--avatar-pants", appearance.pantsColor);
  preview.style.setProperty("--avatar-shoes", appearance.shoesColor);

  for (const child of Array.from(preview.children)) {
    const part = child.getAttribute("data-part") as AvatarPreviewPart | undefined;

    if (!part || !hasStyle(child)) {
      continue;
    }

    child.style.setProperty("--avatar-part-color", colorForPart(part, appearance));
  }
}

function hasStyle(element: Element): element is HTMLElement {
  return "style" in element;
}

function colorForPart(part: AvatarPreviewPart, appearance: AvatarAppearance): string {
  switch (part) {
    case "left-leg":
    case "right-leg":
      return appearance.pantsColor;
    case "left-shoe":
    case "right-shoe":
      return appearance.shoesColor;
    case "torso":
      return appearance.shirtColor;
    case "left-arm":
    case "right-arm":
    case "head":
      return appearance.skinTone;
    case "hair":
      return appearance.hairColor;
    case "left-eye":
    case "right-eye":
      return "#1d2324";
    case "mouth":
      return "#9d5f46";
    case "shadow":
      return "rgba(31, 45, 47, 0.22)";
  }
}
