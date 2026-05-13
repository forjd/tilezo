import { type TilePosition, tileToScreen } from "@tilezo/engine";
import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import avatarManifest from "../../../../assets/avatars/avatar-manifest.json";
import {
  type AvatarAnimationState,
  type AvatarManifest,
  type AvatarRenderDirection,
  parseAvatarManifest,
  type ResolvedAvatarLayer,
  resolveAvatarAssetUrl,
  resolveAvatarFrame,
  resolveAvatarLayers,
  resolveLayerFrameIndex,
  toPixiColor,
} from "./avatarAssets";

type ScreenPosition = {
  x: number;
  y: number;
};

export class Avatar {
  readonly view = new Container();
  readonly userId: string;
  username: string;
  position: TilePosition;
  appearance: AvatarAppearance;

  private readonly spriteLayer = new Container();
  private readonly fallbackBody = new Graphics();
  private readonly chatBubble = new Container();
  private readonly chatBubbleBackground = new Graphics();
  private readonly chatBubbleText: Text;
  private readonly label: Text;
  private spriteManifest?: AvatarManifest;
  private spriteLayers: ResolvedAvatarLayer[] = [];
  private spriteTextures: Texture[] = [];
  private path: TilePosition[] = [];
  private fromScreen: ScreenPosition;
  private to?: TilePosition;
  private progress = 0;
  private bodyVersion = 0;
  private animationState: AvatarAnimationState = "idle";
  private direction: AvatarRenderDirection = "south";
  private animationSeconds = 0;
  private renderedFrameKey = "";
  private chatBubbleSecondsRemaining = 0;
  private readonly secondsPerTile = 0.36;
  private readonly chatBubbleDurationSeconds = 4.5;

  constructor(
    userId: string,
    username: string,
    position: TilePosition,
    appearance: AvatarAppearance = DEFAULT_AVATAR_APPEARANCE,
  ) {
    this.userId = userId;
    this.username = username;
    this.position = { ...position };
    this.appearance = { ...appearance };
    this.fromScreen = tileToScreen(position.x, position.y);

    this.label = new Text({
      text: username,
      style: {
        align: "center",
        fill: 0xffffff,
        fontFamily: "Verdana, Arial, sans-serif",
        fontSize: 12,
        fontWeight: "700",
        stroke: { color: 0x1d2324, width: 4 },
      },
    });

    this.label.anchor.set(0.5, 1);
    this.label.y = -70;

    this.chatBubbleText = new Text({
      text: "",
      style: {
        align: "center",
        breakWords: true,
        fill: 0x1d2324,
        fontFamily: "Verdana, Arial, sans-serif",
        fontSize: 12,
        fontWeight: "700",
        lineHeight: 15,
        padding: 2,
        wordWrap: false,
      },
    });
    this.chatBubbleText.anchor.set(0.5, 1);
    this.chatBubbleText.y = -102;
    this.chatBubble.visible = false;
    this.chatBubble.addChild(this.chatBubbleBackground, this.chatBubbleText);

    this.view.addChild(this.spriteLayer, this.fallbackBody, this.label, this.chatBubble);
    this.rebuildBody();
    this.syncViewToTile(position);
  }

  setAppearance(appearance: AvatarAppearance): void {
    this.appearance = { ...appearance };
    this.rebuildBody();
  }

  say(text: string): void {
    const message = text.trim();

    if (message.length === 0) {
      return;
    }

    const lines = wrapChatBubbleMessage(message);
    this.chatBubbleText.text = lines.join("\n");
    this.chatBubbleSecondsRemaining = this.chatBubbleDurationSeconds;
    this.chatBubble.visible = true;
    this.drawChatBubble(lines);
  }

  setPath(path: TilePosition[]): void {
    const nextPath = this.getUnreachedPath(path);
    const first = nextPath[0];

    if (!first) {
      return;
    }

    if (this.to && sameTile(first, this.to)) {
      this.path = nextPath.slice(1);
      return;
    }

    if (this.to) {
      const next = nextPath.shift();

      if (next) {
        this.path = nextPath;
        this.beginSegment(next, { x: this.view.x, y: this.view.y });
        return;
      }
    }

    this.path = nextPath;
    this.to = undefined;
    this.progress = 0;
  }

  update(deltaSeconds: number): void {
    this.updateChatBubble(deltaSeconds);

    if (!this.to) {
      const next = this.path.shift();

      if (!next) {
        this.setAnimationState("idle");
        this.refreshSpriteFrame();
        return;
      }

      this.beginSegment(next, tileToScreen(this.position.x, this.position.y));
    }

    const target = this.to;

    if (!target) {
      return;
    }

    this.setAnimationState("walk");
    this.animationSeconds += Math.max(0, deltaSeconds);
    this.progress = Math.min(1, this.progress + deltaSeconds / this.secondsPerTile);
    const screenTo = tileToScreen(target.x, target.y);

    this.view.x = lerp(this.fromScreen.x, screenTo.x, this.progress);
    this.view.y = lerp(this.fromScreen.y, screenTo.y, this.progress);
    this.refreshSpriteFrame();

    if (this.progress >= 1) {
      this.position = { ...target };
      this.to = undefined;

      if (this.path.length === 0) {
        this.setAnimationState("idle");
        this.refreshSpriteFrame();
      }
    }
  }

  private syncViewToTile(position: TilePosition): void {
    const screen = tileToScreen(position.x, position.y);
    this.view.x = screen.x;
    this.view.y = screen.y;
  }

  private getUnreachedPath(path: TilePosition[]): TilePosition[] {
    const currentIndex = path.findIndex((position) => sameTile(position, this.position));

    if (currentIndex >= 0) {
      return path.slice(currentIndex + 1);
    }

    const activeTarget = this.to;

    if (activeTarget) {
      const activeTargetIndex = path.findIndex((position) => sameTile(position, activeTarget));

      if (activeTargetIndex >= 0) {
        return path.slice(activeTargetIndex);
      }
    }

    return [...path];
  }

  private updateChatBubble(deltaSeconds: number): void {
    if (this.chatBubbleSecondsRemaining <= 0) {
      return;
    }

    this.chatBubbleSecondsRemaining = Math.max(
      0,
      this.chatBubbleSecondsRemaining - Math.max(0, deltaSeconds),
    );

    if (this.chatBubbleSecondsRemaining === 0) {
      this.chatBubble.visible = false;
    }
  }

  private drawChatBubble(lines: string[]): void {
    const horizontalPadding = 14;
    const verticalPadding = 7;
    const longestLineLength = Math.max(...lines.map((line) => line.length));
    const textWidth = longestLineLength * 9;
    const textHeight = lines.length * 15;
    const width = Math.min(178, Math.max(48, textWidth + horizontalPadding * 2));
    const height = Math.max(28, textHeight + verticalPadding * 2);
    const x = -width / 2;
    const y = this.chatBubbleText.y - textHeight - verticalPadding;

    this.chatBubbleBackground.clear();
    this.chatBubbleBackground.roundRect(x, y, width, height, 12).fill(0xffffff);
    this.chatBubbleBackground.roundRect(x, y, width, height, 12).stroke({
      color: 0x442f24,
      width: 2,
    });
  }

  private rebuildBody(): void {
    this.spriteLayer.removeChildren();
    this.fallbackBody.clear();
    this.spriteManifest = undefined;
    this.spriteLayers = [];
    this.spriteTextures = [];
    this.renderedFrameKey = "";
    this.bodyVersion += 1;

    const manifest = getBundledAvatarManifest();

    if (!manifest) {
      this.drawFallbackBody();
      return;
    }

    const layers = resolveAvatarLayers(manifest, this.appearance);

    if (layers.length === 0) {
      this.drawFallbackBody();
      return;
    }

    const assetUrls = layers.map((layer) => resolveAvatarAssetUrl(layer.src));
    this.spriteManifest = manifest;
    this.spriteLayers = layers;
    this.spriteTextures = layers.map(() => Texture.EMPTY);
    this.refreshSpriteFrame();

    const version = this.bodyVersion;
    void Promise.all(assetUrls.map((url) => Assets.load<Texture>(url)))
      .then((textures) => {
        if (version !== this.bodyVersion) {
          return;
        }

        this.spriteTextures = textures.map((texture) => texture ?? Texture.EMPTY);
        this.renderedFrameKey = "";
        this.refreshSpriteFrame();
      })
      .catch(() => {
        if (version !== this.bodyVersion) {
          return;
        }

        this.drawFallbackBody();
      });
  }

  private refreshSpriteFrame(): void {
    if (
      !this.spriteManifest ||
      this.spriteLayers.length === 0 ||
      this.spriteTextures.length === 0
    ) {
      return;
    }

    const frame = resolveAvatarFrame(
      this.spriteManifest,
      this.animationState,
      this.direction,
      this.animationSeconds,
    );
    const textureKey = this.spriteTextures.map((texture) => texture?.uid ?? "empty").join(",");
    const frameKey = `${frame.index}:${frame.mirrored}:${textureKey}`;

    if (frameKey === this.renderedFrameKey) {
      return;
    }

    this.renderedFrameKey = frameKey;
    this.composeSpriteLayers(frame);
  }

  private composeSpriteLayers(frame: ReturnType<typeof resolveAvatarFrame>): void {
    const manifest = this.spriteManifest;

    if (!manifest) {
      return;
    }

    this.spriteLayer.removeChildren();
    this.fallbackBody.clear();

    for (const [index, layer] of this.spriteLayers.entries()) {
      const texture = createFrameTexture(
        this.spriteTextures[index] ?? Texture.EMPTY,
        manifest,
        resolveLayerFrameIndex(layer, frame.index),
      );
      const sprite = new Sprite(texture);
      sprite.anchor.set(
        manifest.frame.anchorX / manifest.frame.width,
        manifest.frame.anchorY / manifest.frame.height,
      );
      sprite.scale.x = frame.mirrored ? -1 : 1;

      if (layer.tintColor !== undefined) {
        sprite.tint = layer.tintColor;
      }

      this.spriteLayer.addChild(sprite);
    }
  }

  private beginSegment(next: TilePosition, fromScreen: ScreenPosition): void {
    this.fromScreen = { ...fromScreen };
    this.to = next;
    this.progress = 0;
    this.direction = directionBetween(fromScreen, tileToScreen(next.x, next.y));
    this.setAnimationState("walk");
    this.refreshSpriteFrame();
  }

  private setAnimationState(state: AvatarAnimationState): void {
    if (this.animationState === state) {
      return;
    }

    this.animationState = state;
    this.animationSeconds = 0;
    this.renderedFrameKey = "";
  }

  private drawFallbackBody(): void {
    const skinTone = toPixiColor(this.appearance.skinTone);
    const hairColor = toPixiColor(this.appearance.hairColor);
    const shirtColor = toPixiColor(this.appearance.shirtColor);
    const pantsColor = toPixiColor(this.appearance.pantsColor);
    const shoesColor = toPixiColor(this.appearance.shoesColor);

    this.fallbackBody.rect(-5, -10, 4, 10).fill(pantsColor);
    this.fallbackBody.rect(2, -10, 4, 10).fill(pantsColor);
    this.fallbackBody.roundRect(-8, -1, 8, 4, 2).fill(shoesColor);
    this.fallbackBody.roundRect(1, -1, 8, 4, 2).fill(shoesColor);
    this.fallbackBody.roundRect(-8, -28, 16, 20, 4).fill(shirtColor);
    this.fallbackBody.rect(-11, -25, 4, 13).fill(skinTone);
    this.fallbackBody.rect(8, -25, 4, 13).fill(skinTone);
    this.fallbackBody.circle(0, -34, 10).fill(skinTone);
    this.drawHair(hairColor);
    this.fallbackBody.circle(-4, -35, 1.5).fill(0x1d2324);
    this.fallbackBody.circle(4, -35, 1.5).fill(0x1d2324);
    this.fallbackBody.rect(-2, -30, 4, 1).fill(0x9d5f46);
  }

  private drawHair(color: number): void {
    if (this.appearance.hair === "side-part") {
      this.fallbackBody.circle(-2, -39, 9).fill(color);
      this.fallbackBody.rect(-11, -38, 8, 8).fill(color);
      this.fallbackBody.rect(6, -36, 6, 5).fill(color);
      return;
    }

    if (this.appearance.hair === "bob") {
      this.fallbackBody.circle(0, -38, 10).fill(color);
      this.fallbackBody.roundRect(-11, -36, 5, 13, 2).fill(color);
      this.fallbackBody.roundRect(6, -36, 5, 13, 2).fill(color);
      return;
    }

    this.fallbackBody.circle(0, -39, 9).fill(color);
    this.fallbackBody.rect(-9, -38, 18, 7).fill(color);
  }
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function sameTile(a: TilePosition, b: TilePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

function directionBetween(from: ScreenPosition, to: ScreenPosition): AvatarRenderDirection {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);

  if (dx === 0 && dy > 0) {
    return "south";
  }

  if (dx === 0 && dy < 0) {
    return "north";
  }

  if (dx > 0 && dy === 0) {
    return "east";
  }

  if (dx < 0 && dy === 0) {
    return "west";
  }

  if (dx > 0 && dy > 0) {
    return "south-east";
  }

  if (dx < 0 && dy > 0) {
    return "south-west";
  }

  if (dx > 0 && dy < 0) {
    return "north-east";
  }

  if (dx < 0 && dy < 0) {
    return "north-west";
  }

  return "south";
}

function wrapChatBubbleMessage(message: string): string[] {
  const maxLineLength = 16;
  const maxLines = 4;
  const words = message.replace(/\s+/g, " ").split(" ");
  const lines: string[] = [];

  for (const word of words) {
    const chunks = chunkLongWord(word, maxLineLength);

    for (const chunk of chunks) {
      const current = lines.at(-1);

      if (!current) {
        lines.push(chunk);
        continue;
      }

      if (`${current} ${chunk}`.length <= maxLineLength) {
        lines[lines.length - 1] = `${current} ${chunk}`;
        continue;
      }

      lines.push(chunk);
    }
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const visibleLines = lines.slice(0, maxLines);
  const lastLine = visibleLines[maxLines - 1] ?? "";
  visibleLines[maxLines - 1] =
    lastLine.length >= maxLineLength
      ? `${lastLine.slice(0, maxLineLength - 3)}...`
      : `${lastLine}...`;
  return visibleLines;
}

function chunkLongWord(word: string, maxLength: number): string[] {
  if (word.length <= maxLength) {
    return [word];
  }

  const chunks: string[] = [];

  for (let index = 0; index < word.length; index += maxLength) {
    chunks.push(word.slice(index, index + maxLength));
  }

  return chunks;
}

function createFrameTexture(
  texture: Texture,
  manifest: AvatarManifest,
  frameIndex: number,
): Texture {
  if (
    texture === Texture.EMPTY ||
    texture.source.width < manifest.frame.width * (frameIndex + 1) ||
    texture.source.height < manifest.frame.height
  ) {
    return texture;
  }

  return new Texture({
    source: texture.source,
    frame: new Rectangle(
      manifest.frame.width * frameIndex,
      0,
      manifest.frame.width,
      manifest.frame.height,
    ),
  });
}

function getBundledAvatarManifest(): AvatarManifest | undefined {
  try {
    return parseAvatarManifest(avatarManifest);
  } catch {
    return undefined;
  }
}
