import { tileToScreen } from "@tilezo/engine/iso";
import type { TilePosition } from "@tilezo/engine/types";
import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import { Container, Graphics, Text } from "pixi.js";
import {
  AVATAR_BLUSH,
  AVATAR_DETAIL_LIGHT,
  AVATAR_EYE_PUPIL,
  AVATAR_EYE_WHITE,
  AVATAR_FACE_LINE,
  AVATAR_OUTLINE,
  AVATAR_SHADING_ALPHA,
  AVATAR_SHADING_STRENGTH,
  type AvatarAnimationState,
  type AvatarBodyDrawOptions,
  type AvatarRenderDirection,
  darken,
  drawAvatarBody,
  lighten,
  toPixiColor,
} from "./avatarBody";

export type { AvatarAnimationState, AvatarBodyDrawOptions, AvatarRenderDirection };
// Re-export the avatar-body rendering API that used to live here so existing importers
// (AvatarPreview, the preview harness) keep working unchanged.
export { drawAvatarBody };

type ScreenPosition = {
  x: number;
  y: number;
};

export type ChatBubbleLayout = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  setCollisionOffset: (offset: number) => void;
};

type ChatBubbleView = {
  view: Container;
  background: Graphics;
  avatar: Graphics;
  text: Text;
  width: number;
  height: number;
  secondsRemaining: number;
  ageSeconds: number;
  stackOffset: number;
  baseY: number;
};

const CHAT_BUBBLE_MAX_WIDTH = 348;
const CHAT_BUBBLE_LEFT_PADDING = 10;
const CHAT_BUBBLE_RIGHT_PADDING = 14;
const CHAT_BUBBLE_FACE_SIZE = 22;
const CHAT_BUBBLE_FACE_GAP = 4;
const CHAT_BUBBLE_TEXT_MAX_WIDTH =
  CHAT_BUBBLE_MAX_WIDTH -
  CHAT_BUBBLE_LEFT_PADDING -
  CHAT_BUBBLE_FACE_SIZE -
  CHAT_BUBBLE_FACE_GAP -
  CHAT_BUBBLE_RIGHT_PADDING;

export class Avatar {
  readonly view = new Container();
  readonly overlayView = new Container();
  readonly userId: string;
  username: string;
  position: TilePosition;
  appearance: AvatarAppearance;

  private readonly body = new Graphics();
  private readonly typingIndicator = new Container();
  private readonly typingIndicatorBackground = new Graphics();
  private readonly typingIndicatorText: Text;
  private readonly label: Text;
  private readonly chatBubbles: ChatBubbleView[] = [];
  private path: TilePosition[] = [];
  private fromScreen: ScreenPosition;
  private to?: TilePosition;
  private progress = 0;
  private animationState: AvatarAnimationState = "idle";
  private direction: AvatarRenderDirection = "south";
  private animationSeconds = 0;
  private renderedBodyKey = "";
  private isTyping = false;
  private readonly secondsPerTile = 0.36;
  private readonly chatBubbleDurationSeconds = 4.5;
  private readonly maxChatBubbles = 4;

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
      resolution: 2,
      roundPixels: true,
      style: {
        align: "left",
        fill: 0xffffff,
        fontFamily: "Verdana, Arial, sans-serif",
        fontSize: 11,
        fontWeight: "700",
        stroke: { color: 0x1d2324, width: 3 },
      },
      textureStyle: { scaleMode: "linear" },
    });

    this.label.anchor.set(0.5, 1);
    this.label.y = -60;

    this.typingIndicatorBackground.roundPixels = true;
    this.typingIndicatorText = new Text({
      text: "...",
      resolution: 1,
      roundPixels: true,
      style: {
        align: "center",
        fill: 0x1d2324,
        fontFamily: "Verdana, Arial, sans-serif",
        fontSize: 15,
        fontWeight: "900",
        letterSpacing: 1,
        padding: 2,
      },
      textureStyle: { scaleMode: "nearest" },
    });
    this.typingIndicatorText.anchor.set(0.5, 1);
    this.typingIndicatorText.y = -102;
    this.typingIndicator.visible = false;
    this.typingIndicator.addChild(this.typingIndicatorBackground, this.typingIndicatorText);
    this.drawTypingIndicator();

    this.view.addChild(this.body);
    this.overlayView.addChild(this.label, this.typingIndicator);
    this.rebuildBody();
    this.syncViewToTile(position);
  }

  setAppearance(appearance: AvatarAppearance): void {
    this.appearance = { ...appearance };
    this.renderedBodyKey = "";
    this.rebuildBody();
  }

  say(text: string): void {
    const message = text.trim();

    if (message.length === 0) {
      return;
    }

    const bubble = this.createChatBubbleView();
    const lines = wrapChatBubbleMessage(`${this.username}: ${message}`);

    bubble.text.text = lines.join("\n");
    bubble.secondsRemaining = this.chatBubbleDurationSeconds;
    bubble.view.visible = true;
    this.drawChatBubble(bubble, lines);
    this.chatBubbles.push(bubble);
    this.overlayView.addChild(bubble.view);

    while (this.chatBubbles.length > this.maxChatBubbles) {
      const removed = this.chatBubbles.shift();
      removed?.view.destroy({ children: true });
    }

    this.positionChatBubbles(0);
    this.syncTypingIndicatorVisibility();
  }

  setTyping(isTyping: boolean): void {
    this.isTyping = isTyping;
    this.syncTypingIndicatorVisibility();
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
    const safeDelta = Math.max(0, deltaSeconds);
    this.updateChatBubbles(safeDelta);

    if (!this.to) {
      const next = this.path.shift();

      if (!next) {
        this.setAnimationState("idle");
        return;
      }

      this.beginSegment(next, tileToScreen(this.position.x, this.position.y));
    }

    const target = this.to;

    if (!target) {
      return;
    }

    this.setAnimationState("walk");
    this.animationSeconds += safeDelta;
    this.body.y = 0;
    this.progress = Math.min(1, this.progress + deltaSeconds / this.secondsPerTile);
    const screenTo = tileToScreen(target.x, target.y);

    this.view.x = lerp(this.fromScreen.x, screenTo.x, this.progress);
    this.view.y = lerp(this.fromScreen.y, screenTo.y, this.progress);
    this.syncOverlayToView();
    this.rebuildBody();

    if (this.progress >= 1) {
      this.position = { ...target };
      this.to = undefined;

      if (this.path.length === 0) {
        this.setAnimationState("idle");
        this.rebuildBody();
      }
    }
  }

  private syncViewToTile(position: TilePosition): void {
    const screen = tileToScreen(position.x, position.y);
    this.view.x = screen.x;
    this.view.y = screen.y;
    this.syncOverlayToView();
  }

  private syncOverlayToView(): void {
    this.overlayView.x = this.view.x;
    this.overlayView.y = this.view.y;
  }

  getChatBubbleLayouts(): ChatBubbleLayout[] {
    const layouts: ChatBubbleLayout[] = [];

    for (const bubble of this.chatBubbles) {
      if (!bubble.view.visible) {
        continue;
      }

      layouts.push({
        left: this.overlayView.x + bubble.view.x - bubble.width / 2,
        right: this.overlayView.x + bubble.view.x + bubble.width / 2,
        top: this.overlayView.y + bubble.view.y,
        bottom: this.overlayView.y + bubble.view.y + bubble.height,
        setCollisionOffset: (offset: number) => {
          bubble.view.y = bubble.baseY - offset;
        },
      });
    }

    return layouts;
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

  private updateChatBubbles(deltaSeconds: number): void {
    let removedBubble = false;

    for (let index = this.chatBubbles.length - 1; index >= 0; index -= 1) {
      const bubble = this.chatBubbles[index];

      if (!bubble) {
        continue;
      }

      bubble.ageSeconds += deltaSeconds;
      bubble.secondsRemaining = Math.max(0, bubble.secondsRemaining - deltaSeconds);

      if (bubble.secondsRemaining === 0) {
        bubble.view.destroy({ children: true });
        this.chatBubbles.splice(index, 1);
        removedBubble = true;
      }
    }

    this.positionChatBubbles(deltaSeconds);

    if (removedBubble) {
      this.syncTypingIndicatorVisibility();
    }
  }

  private createChatBubbleView(): ChatBubbleView {
    const view = new Container();
    const background = new Graphics();
    const avatar = new Graphics();
    const text = new Text({
      text: "",
      resolution: 3,
      roundPixels: true,
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
      textureStyle: { scaleMode: "linear" },
    });

    background.roundPixels = true;
    avatar.roundPixels = true;
    text.anchor.set(0, 1);
    view.visible = false;
    view.addChild(background, avatar, text);

    return {
      view,
      background,
      avatar,
      text,
      width: 0,
      height: 0,
      secondsRemaining: 0,
      ageSeconds: 0,
      stackOffset: 0,
      baseY: -102,
    };
  }

  private drawChatBubble(bubble: ChatBubbleView, lines: string[]): void {
    const verticalPadding = 7;
    const textWidth = Math.max(...lines.map(estimateChatTextWidth));
    const textHeight = lines.length * 15;
    const width = evenPixel(
      Math.min(
        CHAT_BUBBLE_MAX_WIDTH,
        Math.max(
          78,
          CHAT_BUBBLE_LEFT_PADDING +
            CHAT_BUBBLE_FACE_SIZE +
            CHAT_BUBBLE_FACE_GAP +
            textWidth +
            CHAT_BUBBLE_RIGHT_PADDING,
        ),
      ),
    );
    const height = Math.max(28, textHeight + verticalPadding * 2);
    const x = -width / 2;
    const y = 0;
    const faceCenterX = x + CHAT_BUBBLE_LEFT_PADDING + CHAT_BUBBLE_FACE_SIZE / 2;
    const faceCenterY = y + height / 2;

    bubble.width = width;
    bubble.height = height;
    bubble.text.x = Math.round(faceCenterX + CHAT_BUBBLE_FACE_SIZE / 2 + CHAT_BUBBLE_FACE_GAP);
    bubble.text.y = height - verticalPadding;

    bubble.background.clear();
    bubble.background.roundRect(x, y, width, height, 12).fill(0xffffff);
    bubble.background.roundRect(x, y, width, height, 12).stroke({
      color: 0x442f24,
      width: 2,
    });
    this.drawChatBubbleAvatar(bubble.avatar, faceCenterX, faceCenterY, CHAT_BUBBLE_FACE_SIZE);
  }

  private drawChatBubbleAvatar(
    graphics: Graphics,
    centerX: number,
    centerY: number,
    size: number,
  ): void {
    const skinTone = toPixiColor(this.appearance.skinTone);
    const skinShadow = darken(skinTone, AVATAR_SHADING_STRENGTH);
    const hairColor = toPixiColor(this.appearance.hairColor);
    const hairHighlight = lighten(hairColor, 1.3);
    const frameRadius = size / 2;
    const headRadius = frameRadius - 2;

    graphics.clear();
    // Frame
    graphics.circle(centerX, centerY, frameRadius).fill(0xf1e7d2);
    graphics.circle(centerX, centerY, frameRadius).stroke({ color: 0x442f24, width: 2 });

    // Head (skin)
    graphics.circle(centerX, centerY, headRadius).fill(skinTone);

    // Hair fills the head, face oval carves it out
    if (this.appearance.hair === "buzz") {
      graphics.circle(centerX, centerY, headRadius).fill(darken(hairColor, 0.55));
      graphics.ellipse(centerX, centerY + 2, headRadius - 1, 5).fill(skinTone);
    } else if (this.appearance.hair === "bob") {
      graphics.circle(centerX, centerY, headRadius).fill(hairColor);
      graphics.ellipse(centerX, centerY + 3, headRadius - 2, 4).fill(skinTone);
      // Side flaps along the jaw
      graphics.ellipse(centerX - headRadius + 1, centerY + 1, 1.5, 4).fill(hairColor);
      graphics.ellipse(centerX + headRadius - 1, centerY + 1, 1.5, 4).fill(hairColor);
      // Centre fringe
      graphics.rect(centerX - 5, centerY - 3, 10, 3).fill(hairColor);
    } else if (this.appearance.hair === "side-part") {
      graphics.circle(centerX, centerY, headRadius).fill(hairColor);
      graphics.ellipse(centerX, centerY + 2, headRadius - 1, 5).fill(skinTone);
      // Swept fringe with a part
      graphics.rect(centerX - 6, centerY - 3, 4, 2).fill(hairColor);
      graphics.rect(centerX - 2, centerY - 3, 9, 3).fill(hairColor);
      graphics.rect(centerX - 2, centerY - 3, 1, 2).fill(skinTone);
    } else if (this.appearance.hair === "curls") {
      graphics.circle(centerX, centerY, headRadius).fill(hairColor);
      graphics.ellipse(centerX, centerY + 2, headRadius - 1, 5).fill(skinTone);
      // Curl bumps along the top
      for (const [dx, dy] of [
        [-5, -4],
        [-1, -6],
        [3, -6],
        [6, -4],
      ] as const) {
        graphics.circle(centerX + dx, centerY + dy, 2).fill(hairColor);
      }
    } else if (this.appearance.hair === "afro") {
      for (const [dx, dy, radius] of [
        [-6, -4, 4],
        [-2, -7, 4],
        [3, -7, 4],
        [7, -3, 4],
        [0, -2, 5],
      ] as const) {
        graphics.circle(centerX + dx, centerY + dy, radius).fill(hairColor);
      }
      graphics.ellipse(centerX, centerY + 3, headRadius - 1, 5).fill(skinTone);
    } else if (this.appearance.hair === "ponytail") {
      graphics.circle(centerX, centerY, headRadius).fill(hairColor);
      graphics.ellipse(centerX, centerY + 2, headRadius - 1, 5).fill(skinTone);
      graphics.ellipse(centerX + headRadius - 1, centerY - 1, 3, 6).fill(hairColor);
      graphics.rect(centerX - 5, centerY - 3, 8, 2).fill(hairColor);
    } else if (this.appearance.hair === "braids") {
      graphics.circle(centerX, centerY, headRadius).fill(hairColor);
      graphics.ellipse(centerX, centerY + 3, headRadius - 2, 5).fill(skinTone);
      graphics.rect(centerX - 8, centerY + 1, 2, 7).fill(hairColor);
      graphics.rect(centerX + 6, centerY + 1, 2, 7).fill(hairColor);
      graphics.rect(centerX - 8, centerY + 4, 2, 1).fill(hairHighlight);
      graphics.rect(centerX + 6, centerY + 4, 2, 1).fill(hairHighlight);
    } else if (this.appearance.hair === "undercut") {
      graphics.circle(centerX, centerY, headRadius).fill(darken(hairColor, 0.55));
      graphics.rect(centerX - 7, centerY - 7, 13, 5).fill(hairColor);
      graphics.rect(centerX - 2, centerY - 7, 8, 2).fill(hairHighlight);
      graphics.ellipse(centerX, centerY + 3, headRadius - 1, 5).fill(skinTone);
    } else if (this.appearance.hair === "waves") {
      graphics.circle(centerX, centerY, headRadius).fill(hairColor);
      graphics.ellipse(centerX, centerY + 2, headRadius - 1, 5).fill(skinTone);
      graphics.rect(centerX - 7, centerY - 4, 4, 1).fill(hairHighlight);
      graphics.rect(centerX - 1, centerY - 5, 4, 1).fill(hairHighlight);
      graphics.rect(centerX + 5, centerY - 4, 3, 1).fill(hairHighlight);
    } else if (this.appearance.hair === "bun") {
      graphics.circle(centerX, centerY, headRadius).fill(hairColor);
      graphics.circle(centerX, centerY - headRadius + 1, 4).fill(hairColor);
      graphics.ellipse(centerX, centerY + 3, headRadius - 1, 5).fill(skinTone);
      graphics.rect(centerX - 5, centerY - 3, 10, 2).fill(hairColor);
    } else if (this.appearance.hair === "pixie") {
      graphics.circle(centerX, centerY, headRadius).fill(hairColor);
      graphics.ellipse(centerX, centerY + 3, headRadius - 1, 5).fill(skinTone);
      graphics.rect(centerX - 8, centerY - 5, 6, 3).fill(hairColor);
      graphics.rect(centerX - 1, centerY - 6, 5, 2).fill(hairColor);
      graphics.rect(centerX + 5, centerY - 4, 3, 2).fill(hairColor);
    } else if (this.appearance.hair === "mohawk") {
      graphics.circle(centerX, centerY, headRadius).fill(darken(hairColor, 0.55));
      graphics.rect(centerX - 2, centerY - 9, 4, 9).fill(hairColor);
      graphics.rect(centerX - 1, centerY - 10, 2, 1).fill(hairHighlight);
      graphics.ellipse(centerX, centerY + 3, headRadius - 1, 5).fill(skinTone);
    } else if (this.appearance.hair === "locs") {
      graphics.circle(centerX, centerY, headRadius).fill(hairColor);
      graphics.ellipse(centerX, centerY + 3, headRadius - 2, 5).fill(skinTone);
      for (const x of [-7, -4, 4, 7]) {
        graphics.rect(centerX + x, centerY - 1, 2, 8).fill(hairColor);
      }
    } else {
      // short (default)
      graphics.circle(centerX, centerY, headRadius).fill(hairColor);
      graphics.ellipse(centerX, centerY + 2, headRadius - 1, 5).fill(skinTone);
      // Small centre fringe
      graphics.rect(centerX - 4, centerY - 3, 8, 2).fill(hairColor);
      // Temple wisps
      graphics.rect(centerX - 8, centerY - 2, 1, 3).fill(hairColor);
      graphics.rect(centerX + 7, centerY - 2, 1, 3).fill(hairColor);
    }

    // Skin shading on face
    graphics
      .ellipse(centerX + 2, centerY + 3, 4, 3)
      .fill({ color: skinShadow, alpha: AVATAR_SHADING_ALPHA });

    // Hair highlight
    graphics.rect(centerX - 3, centerY - 7, 5, 1).fill({ color: hairHighlight, alpha: 0.55 });

    // Eyes (whites + pupils + catchlight)
    graphics.rect(centerX - 5, centerY + 1, 3, 3).fill(AVATAR_EYE_WHITE);
    graphics.rect(centerX + 2, centerY + 1, 3, 3).fill(AVATAR_EYE_WHITE);
    graphics.rect(centerX - 4, centerY + 2, 2, 2).fill(AVATAR_EYE_PUPIL);
    graphics.rect(centerX + 3, centerY + 2, 2, 2).fill(AVATAR_EYE_PUPIL);
    graphics.rect(centerX - 4, centerY + 2, 1, 1).fill(AVATAR_EYE_WHITE);
    graphics.rect(centerX + 3, centerY + 2, 1, 1).fill(AVATAR_EYE_WHITE);

    // Cheek blush
    graphics.ellipse(centerX - 6, centerY + 5, 1.4, 0.8).fill({ color: AVATAR_BLUSH, alpha: 0.4 });
    graphics.ellipse(centerX + 6, centerY + 5, 1.4, 0.8).fill({ color: AVATAR_BLUSH, alpha: 0.4 });

    // Mouth
    graphics.rect(centerX - 2, centerY + 6, 4, 1).fill(AVATAR_FACE_LINE);
  }

  private drawTypingIndicator(): void {
    const width = 42;
    const height = 24;
    const x = -width / 2;
    const y = this.typingIndicatorText.y - height + 3;

    this.typingIndicatorBackground.clear();
    this.typingIndicatorBackground.roundRect(x, y, width, height, 12).fill(0xffffff);
    this.typingIndicatorBackground.roundRect(x, y, width, height, 12).stroke({
      color: 0x442f24,
      width: 2,
    });
  }

  private syncTypingIndicatorVisibility(): void {
    this.typingIndicator.visible = this.isTyping && this.chatBubbles.length === 0;
  }

  private positionChatBubbles(deltaSeconds: number): void {
    let targetStackOffset = 0;

    for (let index = this.chatBubbles.length - 1; index >= 0; index -= 1) {
      const bubble = this.chatBubbles[index];

      if (!bubble) {
        continue;
      }

      const lift = easeOutCubic(Math.min(1, bubble.ageSeconds / 0.32)) * 18;
      bubble.stackOffset = approach(bubble.stackOffset, targetStackOffset, deltaSeconds * 14);
      bubble.baseY = Math.round(-102 - bubble.stackOffset - lift);
      bubble.view.x = 0;
      bubble.view.y = bubble.baseY;
      targetStackOffset += bubble.height + 6;
    }
  }

  private rebuildBody(): void {
    const stepFrame =
      this.animationState === "walk" ? Math.floor(this.animationSeconds / 0.12) % 2 : 0;
    const bodyKey = [
      this.appearance.hair,
      this.appearance.hairColor,
      this.appearance.skinTone,
      this.appearance.shirt,
      this.appearance.shirtColor,
      this.appearance.pants,
      this.appearance.pantsColor,
      this.appearance.shoes,
      this.appearance.shoesColor,
      this.direction,
      this.animationState,
      stepFrame,
    ].join("|");

    if (bodyKey === this.renderedBodyKey) {
      return;
    }

    this.renderedBodyKey = bodyKey;
    this.body.clear();
    drawAvatarBody(this.body, {
      appearance: this.appearance,
      direction: this.direction,
      animationState: this.animationState,
      stepFrame,
    });
  }

  private beginSegment(next: TilePosition, fromScreen: ScreenPosition): void {
    this.fromScreen = { ...fromScreen };
    this.to = next;
    this.progress = 0;
    this.direction = directionBetween(fromScreen, tileToScreen(next.x, next.y));
    this.setAnimationState("walk");
    this.rebuildBody();
  }

  private setAnimationState(state: AvatarAnimationState): void {
    if (this.animationState === state) {
      return;
    }

    this.animationState = state;
    this.animationSeconds = 0;
    this.renderedBodyKey = "";
  }

  destroy(): void {
    this.view.destroy({ children: true });
    this.overlayView.destroy({ children: true });
  }
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function approach(current: number, target: number, factor: number): number {
  if (factor <= 0) {
    return target;
  }

  return lerp(current, target, Math.min(1, factor));
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function evenPixel(value: number): number {
  return Math.ceil(value / 2) * 2;
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
  const maxLines = 4;
  const words = message.replace(/\s+/g, " ").split(" ");
  const lines: string[] = [];

  for (const word of words) {
    const chunks = chunkLongWord(word);

    for (const chunk of chunks) {
      const current = lines.at(-1);

      if (!current) {
        lines.push(chunk);
        continue;
      }

      if (estimateChatTextWidth(`${current} ${chunk}`) <= CHAT_BUBBLE_TEXT_MAX_WIDTH) {
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
  visibleLines[maxLines - 1] = fitChatLineWithEllipsis(lastLine);
  return visibleLines;
}

function chunkLongWord(word: string): string[] {
  if (estimateChatTextWidth(word) <= CHAT_BUBBLE_TEXT_MAX_WIDTH) {
    return [word];
  }

  const chunks: string[] = [];
  let chunk = "";

  for (const character of word) {
    const nextChunk = `${chunk}${character}`;

    if (chunk && estimateChatTextWidth(nextChunk) > CHAT_BUBBLE_TEXT_MAX_WIDTH) {
      chunks.push(chunk);
      chunk = character;
      continue;
    }

    chunk = nextChunk;
  }

  if (chunk) {
    chunks.push(chunk);
  }

  return chunks;
}

function fitChatLineWithEllipsis(line: string): string {
  const ellipsis = "...";
  let fitted = line;

  while (fitted && estimateChatTextWidth(`${fitted}${ellipsis}`) > CHAT_BUBBLE_TEXT_MAX_WIDTH) {
    fitted = fitted.slice(0, -1);
  }

  return `${fitted}${ellipsis}`;
}

function estimateChatTextWidth(text: string): number {
  let width = 0;

  for (const character of text) {
    if (character === " ") {
      width += 4;
    } else if (/[A-Z]/.test(character)) {
      width += 11;
    } else if (/[0-9]/.test(character)) {
      width += 9;
    } else if (/[il.,:;!'|]/.test(character)) {
      width += 5;
    } else if (/[-_]/.test(character)) {
      width += 6;
    } else {
      width += 9;
    }
  }

  return width;
}
