import {
  AVATAR_HAIR_STYLES,
  type AvatarHairStyle,
  DEFAULT_AVATAR_APPEARANCE,
} from "@tilezo/protocol/appearance";
import { Application, Container, Graphics, Rectangle } from "pixi.js";
import { Avatar, drawAvatarBody } from "./game/Avatar";

const hairStyles: readonly AvatarHairStyle[] = AVATAR_HAIR_STYLES;

const grid = document.getElementById("grid");

if (!grid) {
  throw new Error("Preview grid element is missing");
}

// A single shared offscreen renderer (one WebGL context) snapshots every avatar variant
// into its own static 2D canvas. The previous harness created one Pixi Application — and
// therefore one WebGL context — per grid cell, which silently broke once the grid grew
// past the browser's live-context limit (~16): the excess contexts were lost and their
// shaders failed to compile.
const app = new Application();
await app.init({
  antialias: false,
  backgroundAlpha: 0,
  width: 256,
  height: 256,
  roundPixels: true,
});
app.ticker.stop();

function addCell(label: string, view: HTMLCanvasElement, width: number, height: number): void {
  const cell = document.createElement("div");
  cell.className = "cell";
  const labelElement = document.createElement("div");
  labelElement.className = "label";
  labelElement.textContent = label;
  view.style.width = `${width.toString()}px`;
  view.style.height = `${height.toString()}px`;
  view.style.imageRendering = "pixelated";
  cell.append(labelElement, view);
  grid?.appendChild(cell);
}

function snapshot(target: Container, width: number, height: number): HTMLCanvasElement {
  return app.renderer.extract.canvas({
    target,
    frame: new Rectangle(0, 0, width, height),
  }) as HTMLCanvasElement;
}

for (const hair of hairStyles) {
  const root = new Container();
  const inner = new Container();
  inner.scale.set(3);
  inner.x = 60;
  inner.y = 130;
  const body = new Graphics();
  inner.addChild(body);
  root.addChild(inner);
  drawAvatarBody(body, {
    appearance: { ...DEFAULT_AVATAR_APPEARANCE, hair },
    direction: "south",
    animationState: "idle",
    stepFrame: 0,
  });

  addCell(hair, snapshot(root, 120, 160), 120, 160);
  root.destroy({ children: true });
}

for (const hair of hairStyles) {
  const root = new Container();
  const inner = new Container();
  inner.scale.set(2);
  inner.x = 60;
  inner.y = 130;
  const avatar = new Avatar(
    "preview",
    "Preview",
    { x: 0, y: 0 },
    {
      ...DEFAULT_AVATAR_APPEARANCE,
      hair,
    },
  );
  inner.addChild(avatar.view, avatar.overlayView);
  root.addChild(inner);
  avatar.say("Hello!");
  // Advance the avatar so the chat bubble has animated into view before the snapshot.
  for (let frame = 0; frame < 16; frame += 1) {
    avatar.update(0.05);
  }

  addCell(`bubble: ${hair}`, snapshot(root, 240, 80), 240, 80);
  avatar.destroy();
}
