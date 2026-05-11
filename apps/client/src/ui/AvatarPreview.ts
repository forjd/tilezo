import type { AvatarAppearance } from "@tilezo/protocol";
import avatarManifest from "../../../../assets/avatars/avatar-manifest.json";
import {
  type AvatarAnimationState,
  type AvatarManifest,
  type AvatarRenderDirection,
  parseAvatarManifest,
  resolveAvatarAssetUrl,
  resolveAvatarFrame,
  resolveAvatarLayers,
  resolveLayerFrameIndex,
} from "../game/avatarAssets";

const manifest = parseAvatarManifest(avatarManifest);

type AvatarPreviewOptions = {
  state?: AvatarAnimationState;
  direction?: AvatarRenderDirection;
  elapsedSeconds?: number;
};

export function createAvatarPreview(documentRef: Document): HTMLDivElement {
  const preview = documentRef.createElement("div");
  preview.className = "avatar-preview-sprite";
  preview.style.setProperty("--avatar-frame-width", `${manifest.frame.width}px`);
  preview.style.setProperty("--avatar-frame-height", `${manifest.frame.height}px`);
  return preview;
}

export function updateAvatarPreview(
  preview: HTMLElement,
  appearance: AvatarAppearance,
  options: AvatarPreviewOptions = {},
): void {
  preview.innerHTML = "";

  const frame = resolveAvatarFrame(
    manifest,
    options.state ?? "idle",
    options.direction ?? "south",
    options.elapsedSeconds ?? 0,
  );

  for (const layer of resolveAvatarLayers(manifest, appearance)) {
    const documentRef = preview.ownerDocument ?? document;
    const layerElement = documentRef.createElement("img");
    const layerFrameIndex = resolveLayerFrameIndex(layer, frame.index);
    const layerUrl = layer.tint
      ? createTintedLayerUrl(
          resolveAvatarAssetUrl(layer.src),
          appearance[layer.tint],
          layerFrameIndex,
        )
      : createLayerFrameUrl(resolveAvatarAssetUrl(layer.src), layerFrameIndex);

    layerElement.className = "avatar-preview-layer";
    layerElement.setAttribute("alt", "");
    layerElement.setAttribute("aria-hidden", "true");
    layerElement.setAttribute("src", layerUrl);
    layerElement.setAttribute("data-slot", layer.slot);
    layerElement.setAttribute("data-layer-id", layer.id);
    layerElement.setAttribute("data-frame-index", String(layerFrameIndex));

    if (layer.tint) {
      layerElement.style.setProperty("--layer-tint", appearance[layer.tint]);
    }

    if (frame.mirrored) {
      layerElement.style.setProperty("--layer-scale-x", "-1");
    }

    preview.append(layerElement);
  }
}

export function getAvatarPreviewManifest(): AvatarManifest {
  return manifest;
}

function createTintedLayerUrl(src: string, color: string, frameIndex: number): string {
  const frameX = manifest.frame.width * frameIndex;
  const stripWidth = manifest.frame.width * getMaxFrames();
  const frameImage = `<image href="${src}" x="${-frameX}" y="0" width="${stripWidth}" height="${manifest.frame.height}" style="image-rendering:pixelated"/>`;
  const shadedFrameImage = `<image href="${src}" x="${-frameX}" y="0" width="${stripWidth}" height="${manifest.frame.height}" style="image-rendering:pixelated;mix-blend-mode:multiply"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${manifest.frame.width}" height="${manifest.frame.height}" viewBox="0 0 ${manifest.frame.width} ${manifest.frame.height}" shape-rendering="crispEdges" style="image-rendering:pixelated"><defs><mask id="layer-mask" maskUnits="userSpaceOnUse">${frameImage}</mask></defs><g mask="url(#layer-mask)"><rect width="${manifest.frame.width}" height="${manifest.frame.height}" fill="${color}"/>${shadedFrameImage}</g></svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function createLayerFrameUrl(src: string, frameIndex: number): string {
  const frameX = manifest.frame.width * frameIndex;
  const stripWidth = manifest.frame.width * getMaxFrames();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${manifest.frame.width}" height="${manifest.frame.height}" viewBox="0 0 ${manifest.frame.width} ${manifest.frame.height}" shape-rendering="crispEdges" style="image-rendering:pixelated"><image href="${src}" x="${-frameX}" y="0" width="${stripWidth}" height="${manifest.frame.height}" style="image-rendering:pixelated"/></svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function getMaxFrames(): number {
  return Math.max(...manifest.layers.map((layer) => layer.frames));
}
