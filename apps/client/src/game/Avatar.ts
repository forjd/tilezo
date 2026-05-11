import { type TilePosition, tileToScreen } from "@tilezo/engine";
import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import avatarManifest from "../../../../assets/avatars/avatar-manifest.json";
import {
  type AvatarManifest,
  parseAvatarManifest,
  type ResolvedAvatarLayer,
  resolveAvatarAssetUrl,
  resolveAvatarLayers,
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
  private readonly label: Text;
  private path: TilePosition[] = [];
  private from: TilePosition;
  private fromScreen: ScreenPosition;
  private to?: TilePosition;
  private progress = 0;
  private bodyVersion = 0;
  private readonly secondsPerTile = 0.36;

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
    this.from = { ...position };
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
    this.label.y = -34;

    this.view.addChild(this.spriteLayer, this.fallbackBody, this.label);
    this.rebuildBody();
    this.syncViewToTile(position);
  }

  setAppearance(appearance: AvatarAppearance): void {
    this.appearance = { ...appearance };
    this.rebuildBody();
  }

  setPath(path: TilePosition[]): void {
    const first = path[0];

    if (!first) {
      return;
    }

    if (this.to && sameTile(first, this.to)) {
      this.path = path.slice(1);
      return;
    }

    const second = path[1];

    if (this.to && sameTile(first, this.position) && second && sameTile(second, this.to)) {
      this.path = path.slice(2);
      return;
    }

    const nextPath = sameTile(first, this.position) ? path.slice(1) : [...path];

    if (this.to) {
      const next = nextPath.shift();

      if (next) {
        this.path = nextPath;
        this.from = { ...this.position };
        this.fromScreen = { x: this.view.x, y: this.view.y };
        this.to = next;
        this.progress = 0;
        return;
      }
    }

    this.path = nextPath;
    this.to = undefined;
    this.progress = 0;
  }

  update(deltaSeconds: number): void {
    if (!this.to) {
      const next = this.path.shift();

      if (!next) {
        return;
      }

      this.from = { ...this.position };
      this.fromScreen = tileToScreen(this.from.x, this.from.y);
      this.to = next;
      this.progress = 0;
    }

    this.progress = Math.min(1, this.progress + deltaSeconds / this.secondsPerTile);
    const screenTo = tileToScreen(this.to.x, this.to.y);

    this.view.x = lerp(this.fromScreen.x, screenTo.x, this.progress);
    this.view.y = lerp(this.fromScreen.y, screenTo.y, this.progress);

    if (this.progress >= 1) {
      this.position = { ...this.to };
      this.to = undefined;
    }
  }

  private syncViewToTile(position: TilePosition): void {
    const screen = tileToScreen(position.x, position.y);
    this.view.x = screen.x;
    this.view.y = screen.y;
  }

  private rebuildBody(): void {
    this.spriteLayer.removeChildren();
    this.fallbackBody.clear();
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
    this.composeSpriteLayers(
      manifest,
      layers,
      assetUrls.map((url) => Texture.from(url)),
    );

    const version = this.bodyVersion;
    void Promise.all(assetUrls.map((url) => Assets.load<Texture>(url)))
      .then((textures) => {
        if (version !== this.bodyVersion) {
          return;
        }

        this.composeSpriteLayers(manifest, layers, textures);
      })
      .catch(() => {
        if (version !== this.bodyVersion || this.spriteLayer.children.length > 0) {
          return;
        }

        this.drawFallbackBody();
      });
  }

  private composeSpriteLayers(
    manifest: AvatarManifest,
    layers: ResolvedAvatarLayer[],
    textures: Texture[],
  ): void {
    this.spriteLayer.removeChildren();
    this.fallbackBody.clear();

    for (const [index, layer] of layers.entries()) {
      const texture = textures[index] ?? Texture.EMPTY;
      const sprite = new Sprite(texture);
      sprite.x = -manifest.frame.anchorX;
      sprite.y = -manifest.frame.anchorY;

      if (layer.tintColor !== undefined) {
        sprite.tint = layer.tintColor;
      }

      this.spriteLayer.addChild(sprite);
    }
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

function getBundledAvatarManifest(): AvatarManifest | undefined {
  try {
    return parseAvatarManifest(avatarManifest);
  } catch {
    return undefined;
  }
}
