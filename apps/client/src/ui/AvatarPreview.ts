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

const imageCache = new Map<string, Promise<HTMLImageElement>>();
let previewRenderVersion = 0;

export function createAvatarPreview(documentRef: Document): HTMLDivElement {
  const preview = documentRef.createElement("div");
  const canvas = documentRef.createElement("canvas");
  preview.className = "avatar-preview-sprite";
  preview.style.setProperty("--avatar-frame-width", `${manifest.frame.width}px`);
  preview.style.setProperty("--avatar-frame-height", `${manifest.frame.height}px`);

  if (isCanvas(canvas)) {
    canvas.className = "avatar-preview-canvas";
    canvas.width = manifest.frame.width;
    canvas.height = manifest.frame.height;
    canvas.setAttribute("aria-hidden", "true");
    preview.append(canvas);
  }

  return preview;
}

export function updateAvatarPreview(
  preview: HTMLElement,
  appearance: AvatarAppearance,
  options: AvatarPreviewOptions = {},
): void {
  const frame = resolveAvatarFrame(
    manifest,
    options.state ?? "idle",
    options.direction ?? "south",
    options.elapsedSeconds ?? 0,
  );
  const canvas = Array.from(preview.children).find(isCanvas);

  if (canvas) {
    previewRenderVersion += 1;
    const version = previewRenderVersion;
    void renderCanvasPreview(canvas, appearance, frame.index, frame.mirrored, version);
    return;
  }

  preview.innerHTML = "";
  renderImageLayerPreview(preview, appearance, frame.index, frame.mirrored);
}

export function getAvatarPreviewManifest(): AvatarManifest {
  return manifest;
}

function renderImageLayerPreview(
  preview: HTMLElement,
  appearance: AvatarAppearance,
  frameIndex: number,
  mirrored: boolean,
): void {
  for (const layer of resolveAvatarLayers(manifest, appearance)) {
    const documentRef = preview.ownerDocument ?? document;
    const layerElement = documentRef.createElement("img");
    const layerFrameIndex = resolveLayerFrameIndex(layer, frameIndex);
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

    if (mirrored) {
      layerElement.style.setProperty("--layer-scale-x", "-1");
    }

    preview.append(layerElement);
  }
}

async function renderCanvasPreview(
  canvas: HTMLCanvasElement,
  appearance: AvatarAppearance,
  frameIndex: number,
  mirrored: boolean,
  version: number,
): Promise<void> {
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return;
  }

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, manifest.frame.width, manifest.frame.height);

  for (const layer of resolveAvatarLayers(manifest, appearance)) {
    const image = await loadLayerImage(resolveAvatarAssetUrl(layer.src));

    if (version !== previewRenderVersion) {
      return;
    }

    const layerFrameIndex = resolveLayerFrameIndex(layer, frameIndex);
    drawLayerFrame(
      context,
      image,
      layerFrameIndex,
      layer.tint ? appearance[layer.tint] : undefined,
    );
  }

  canvas.style.setProperty("--layer-scale-x", mirrored ? "-1" : "1");
}

function drawLayerFrame(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  frameIndex: number,
  tint?: string,
): void {
  const scratch = document.createElement("canvas");
  scratch.width = manifest.frame.width;
  scratch.height = manifest.frame.height;
  const scratchContext = scratch.getContext("2d", { willReadFrequently: true });

  if (!scratchContext) {
    return;
  }

  scratchContext.imageSmoothingEnabled = false;
  scratchContext.drawImage(
    image,
    manifest.frame.width * frameIndex,
    0,
    manifest.frame.width,
    manifest.frame.height,
    0,
    0,
    manifest.frame.width,
    manifest.frame.height,
  );

  if (tint) {
    tintCanvas(scratchContext, tint);
  }

  context.drawImage(scratch, 0, 0);
}

function tintCanvas(context: CanvasRenderingContext2D, tint: string): void {
  const color = parseHexColor(tint);

  if (!color) {
    return;
  }

  const imageData = context.getImageData(0, 0, manifest.frame.width, manifest.frame.height);

  for (let index = 0; index < imageData.data.length; index += 4) {
    const alpha = imageData.data[index + 3] ?? 0;

    if (alpha === 0) {
      continue;
    }

    const shade =
      ((imageData.data[index] ?? 0) +
        (imageData.data[index + 1] ?? 0) +
        (imageData.data[index + 2] ?? 0)) /
      (255 * 3);
    const lift = 0.68 + shade * 0.58;
    imageData.data[index] = Math.min(255, Math.round(color.r * lift));
    imageData.data[index + 1] = Math.min(255, Math.round(color.g * lift));
    imageData.data[index + 2] = Math.min(255, Math.round(color.b * lift));
  }

  context.putImageData(imageData, 0, 0);
}

function loadLayerImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);

  if (cached) {
    return cached;
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load avatar layer ${src}`));
    image.src = src;
  });
  imageCache.set(src, promise);
  return promise;
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

function isCanvas(element: Element): element is HTMLCanvasElement {
  return typeof HTMLCanvasElement !== "undefined" && element instanceof HTMLCanvasElement;
}

function parseHexColor(value: string): { r: number; g: number; b: number } | undefined {
  if (!/^#[\da-fA-F]{6}$/.test(value)) {
    return undefined;
  }

  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}
