import type { AvatarAppearance } from "@tilezo/protocol";
import avatarManifest from "../../../../assets/avatars/avatar-manifest.json";
import {
  type AvatarManifest,
  parseAvatarManifest,
  resolveAvatarAssetUrl,
  resolveAvatarLayers,
} from "../game/avatarAssets";

const manifest = parseAvatarManifest(avatarManifest);

export function createAvatarPreview(documentRef: Document): HTMLDivElement {
  const preview = documentRef.createElement("div");
  preview.className = "avatar-preview-sprite";
  preview.style.setProperty("--avatar-frame-width", `${manifest.frame.width}px`);
  preview.style.setProperty("--avatar-frame-height", `${manifest.frame.height}px`);
  return preview;
}

export function updateAvatarPreview(preview: HTMLElement, appearance: AvatarAppearance): void {
  preview.innerHTML = "";

  for (const layer of resolveAvatarLayers(manifest, appearance)) {
    const documentRef = preview.ownerDocument ?? document;
    const layerElement = documentRef.createElement("span");
    layerElement.className = "avatar-preview-layer";
    layerElement.setAttribute("data-slot", layer.slot);
    layerElement.setAttribute("data-layer-id", layer.id);
    layerElement.style.setProperty("--layer-image", `url("${resolveAvatarAssetUrl(layer.src)}")`);

    if (layer.tint) {
      layerElement.style.setProperty("--layer-tint", appearance[layer.tint]);
    }

    preview.append(layerElement);
  }
}

export function getAvatarPreviewManifest(): AvatarManifest {
  return manifest;
}
