import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import { Application, Container, Graphics } from "pixi.js";
import { drawAvatarBody } from "../game/Avatar";

const PREVIEW_WIDTH = 180;
const PREVIEW_HEIGHT = 220;
const PREVIEW_SCALE = 3;
const PREVIEW_BASELINE_FROM_BOTTOM = 28;

type PreviewApplication = {
  canvas: HTMLCanvasElement;
  destroy(removeView?: boolean): void;
  init(options: Parameters<Application["init"]>[0]): Promise<void>;
  stage: Pick<Application["stage"], "addChild">;
};

export class AvatarPreview {
  readonly element: HTMLDivElement;
  private readonly app: PreviewApplication;
  private readonly stageContainer = new Container();
  private readonly body = new Graphics();
  private currentAppearance: AvatarAppearance = DEFAULT_AVATAR_APPEARANCE;
  private renderedKey = "";
  private mounted = false;
  private mountPromise?: Promise<void>;
  private mountVersion = 0;

  constructor(documentRef: Document = document, app: PreviewApplication = new Application()) {
    this.app = app;
    this.element = documentRef.createElement("div") as HTMLDivElement;
    this.element.className = "avatar-preview";
    this.element.setAttribute("aria-hidden", "true");
    this.stageContainer.addChild(this.body);
    this.stageContainer.scale.set(PREVIEW_SCALE);
    this.stageContainer.x = PREVIEW_WIDTH / 2;
    this.stageContainer.y = PREVIEW_HEIGHT - PREVIEW_BASELINE_FROM_BOTTOM;
    this.renderBody();
  }

  update(appearance: AvatarAppearance): void {
    this.currentAppearance = { ...appearance };
    this.renderBody();
  }

  async mount(): Promise<void> {
    if (this.mounted) {
      return;
    }

    if (this.mountPromise) {
      return this.mountPromise;
    }

    if (typeof HTMLCanvasElement === "undefined") {
      return;
    }

    const mountVersion = ++this.mountVersion;
    const mountPromise = this.mountAfterInit(mountVersion);
    this.mountPromise = mountPromise;

    try {
      await mountPromise;
    } finally {
      if (this.mountPromise === mountPromise) {
        this.mountPromise = undefined;
      }
    }
  }

  destroy(): void {
    this.mountVersion += 1;

    if (!this.mounted) {
      return;
    }

    this.mounted = false;
    this.app.destroy(true);
  }

  get appearance(): AvatarAppearance {
    return { ...this.currentAppearance };
  }

  private renderBody(): void {
    const key = appearanceKey(this.currentAppearance);

    if (key === this.renderedKey) {
      return;
    }

    this.renderedKey = key;
    this.body.clear();
    drawAvatarBody(this.body, {
      appearance: this.currentAppearance,
      direction: "south",
      animationState: "idle",
      stepFrame: 0,
    });
  }

  private async mountAfterInit(mountVersion: number): Promise<void> {
    await this.app.init({
      antialias: false,
      autoDensity: true,
      backgroundAlpha: 0,
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT,
      roundPixels: true,
    });

    if (mountVersion !== this.mountVersion) {
      this.app.destroy(true);
      return;
    }

    this.app.canvas.style.imageRendering = "pixelated";
    this.app.canvas.style.width = `${PREVIEW_WIDTH}px`;
    this.app.canvas.style.height = `${PREVIEW_HEIGHT}px`;
    this.app.canvas.style.display = "block";
    this.app.stage.addChild(this.stageContainer);
    this.element.append(this.app.canvas);
    this.mounted = true;
  }
}

function appearanceKey(appearance: AvatarAppearance): string {
  return [
    appearance.hair,
    appearance.hairColor,
    appearance.skinTone,
    appearance.shirt,
    appearance.shirtColor,
    appearance.pants,
    appearance.pantsColor,
    appearance.shoes,
    appearance.shoesColor,
  ].join("|");
}
