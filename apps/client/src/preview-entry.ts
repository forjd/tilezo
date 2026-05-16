import { Application, Container, Graphics } from "pixi.js";
import {
  type AvatarAppearance,
  type AvatarHairStyle,
  DEFAULT_AVATAR_APPEARANCE,
} from "@tilezo/protocol/appearance";
import { Avatar, drawAvatarBody, type AvatarRenderDirection } from "./game/Avatar";

const hairStyles: readonly AvatarHairStyle[] = ["short", "side-part", "bob", "curls", "buzz"];

const bodyVariants: {
  label: string;
  appearance: AvatarAppearance;
  direction: AvatarRenderDirection;
}[] = hairStyles.map((hair) => ({
  label: `${hair}`,
  appearance: { ...DEFAULT_AVATAR_APPEARANCE, hair },
  direction: "south",
}));

const bubbleVariants: { label: string; appearance: AvatarAppearance }[] = hairStyles.map((hair) => ({
  label: `bubble: ${hair}`,
  appearance: { ...DEFAULT_AVATAR_APPEARANCE, hair },
}));

const grid = document.getElementById("grid")!;

for (const variant of bodyVariants) {
  const cell = document.createElement("div");
  cell.className = "cell";
  const label = document.createElement("div");
  label.className = "label";
  label.textContent = variant.label;
  cell.appendChild(label);
  grid.appendChild(cell);

  const app = new Application();
  await app.init({
    antialias: false,
    autoDensity: true,
    backgroundAlpha: 0,
    width: 120,
    height: 160,
    roundPixels: true,
  });
  app.canvas.style.width = "120px";
  app.canvas.style.height = "160px";
  app.canvas.style.imageRendering = "pixelated";

  const container = new Container();
  container.scale.set(3);
  container.x = 60;
  container.y = 130;
  app.stage.addChild(container);

  const body = new Graphics();
  container.addChild(body);
  drawAvatarBody(body, {
    appearance: variant.appearance,
    direction: variant.direction,
    animationState: "idle",
    stepFrame: 0,
  });

  cell.appendChild(app.canvas);
}

for (const variant of bubbleVariants) {
  const cell = document.createElement("div");
  cell.className = "cell";
  const label = document.createElement("div");
  label.className = "label";
  label.textContent = variant.label;
  cell.appendChild(label);
  grid.appendChild(cell);

  const app = new Application();
  await app.init({
    antialias: false,
    autoDensity: true,
    backgroundAlpha: 0,
    width: 240,
    height: 80,
    roundPixels: true,
  });
  app.canvas.style.width = "240px";
  app.canvas.style.height = "80px";
  app.canvas.style.imageRendering = "pixelated";

  const stageContainer = new Container();
  stageContainer.scale.set(2);
  stageContainer.x = 60;
  stageContainer.y = 130;
  app.stage.addChild(stageContainer);

  const avatar = new Avatar("preview", "Preview", { x: 0, y: 0 }, variant.appearance);
  stageContainer.addChild(avatar.view);
  stageContainer.addChild(avatar.overlayView);
  avatar.say("Hello!");

  cell.appendChild(app.canvas);
}
