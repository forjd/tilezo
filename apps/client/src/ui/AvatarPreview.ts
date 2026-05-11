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
    const layerElement = documentRef.createElement("img");
    const layerUrl = layer.tint
      ? createTintedLayerUrl(resolveAvatarAssetUrl(layer.src), appearance[layer.tint])
      : resolveAvatarAssetUrl(layer.src);

    layerElement.className = "avatar-preview-layer";
    layerElement.setAttribute("alt", "");
    layerElement.setAttribute("aria-hidden", "true");
    layerElement.setAttribute("src", layerUrl);
    layerElement.setAttribute("data-slot", layer.slot);
    layerElement.setAttribute("data-layer-id", layer.id);

    if (layer.tint) {
      layerElement.style.setProperty("--layer-tint", appearance[layer.tint]);
    }

    preview.append(layerElement);
  }
}

export function getAvatarPreviewManifest(): AvatarManifest {
  return manifest;
}

function createTintedLayerUrl(maskUrl: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${manifest.frame.width}" height="${manifest.frame.height}" viewBox="0 0 ${manifest.frame.width} ${manifest.frame.height}"><defs><mask id="layer-mask" maskUnits="userSpaceOnUse"><image href="${maskUrl}" width="${manifest.frame.width}" height="${manifest.frame.height}"/></mask></defs><rect width="${manifest.frame.width}" height="${manifest.frame.height}" fill="${color}" mask="url(#layer-mask)"/></svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
