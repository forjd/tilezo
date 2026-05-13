import { tileToScreen } from "@tilezo/engine/iso";
import type { TilePosition } from "@tilezo/engine/types";
import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import { Container, Graphics, Text } from "pixi.js";

type ScreenPosition = {
  x: number;
  y: number;
};

type AvatarAnimationState = "idle" | "walk";

type AvatarRenderDirection =
  | "south"
  | "south-east"
  | "east"
  | "north-east"
  | "north"
  | "north-west"
  | "west"
  | "south-west";

export class Avatar {
  readonly view = new Container();
  readonly userId: string;
  username: string;
  position: TilePosition;
  appearance: AvatarAppearance;

  private readonly body = new Graphics();
  private readonly chatBubble = new Container();
  private readonly chatBubbleBackground = new Graphics();
  private readonly chatBubbleText: Text;
  private readonly typingIndicator = new Container();
  private readonly typingIndicatorBackground = new Graphics();
  private readonly typingIndicatorText: Text;
  private readonly label: Text;
  private path: TilePosition[] = [];
  private fromScreen: ScreenPosition;
  private to?: TilePosition;
  private progress = 0;
  private animationState: AvatarAnimationState = "idle";
  private direction: AvatarRenderDirection = "south";
  private animationSeconds = 0;
  private renderedBodyKey = "";
  private chatBubbleSecondsRemaining = 0;
  private isTyping = false;
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

    this.typingIndicatorText = new Text({
      text: "...",
      style: {
        align: "center",
        fill: 0x1d2324,
        fontFamily: "Verdana, Arial, sans-serif",
        fontSize: 15,
        fontWeight: "900",
        letterSpacing: 1,
        padding: 2,
      },
    });
    this.typingIndicatorText.anchor.set(0.5, 1);
    this.typingIndicatorText.y = -102;
    this.typingIndicator.visible = false;
    this.typingIndicator.addChild(this.typingIndicatorBackground, this.typingIndicatorText);
    this.drawTypingIndicator();

    this.view.addChild(this.body, this.label, this.chatBubble, this.typingIndicator);
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

    const lines = wrapChatBubbleMessage(message);
    this.chatBubbleText.text = lines.join("\n");
    this.chatBubbleSecondsRemaining = this.chatBubbleDurationSeconds;
    this.chatBubble.visible = true;
    this.syncTypingIndicatorVisibility();
    this.drawChatBubble(lines);
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
    this.updateChatBubble(deltaSeconds);

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
    this.animationSeconds += Math.max(0, deltaSeconds);
    this.progress = Math.min(1, this.progress + deltaSeconds / this.secondsPerTile);
    const screenTo = tileToScreen(target.x, target.y);

    this.view.x = lerp(this.fromScreen.x, screenTo.x, this.progress);
    this.view.y = lerp(this.fromScreen.y, screenTo.y, this.progress);
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
      this.syncTypingIndicatorVisibility();
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
    this.typingIndicator.visible = this.isTyping && !this.chatBubble.visible;
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
    this.drawBody(stepFrame);
  }

  private drawBody(stepFrame: number): void {
    const skinTone = toPixiColor(this.appearance.skinTone);
    const hairColor = toPixiColor(this.appearance.hairColor);
    const shirtColor = toPixiColor(this.appearance.shirtColor);
    const pantsColor = toPixiColor(this.appearance.pantsColor);
    const shoesColor = toPixiColor(this.appearance.shoesColor);
    const stride = this.animationState === "walk" && stepFrame === 1 ? 2 : 0;
    const bob = this.animationState === "walk" && stepFrame === 1 ? -1 : 0;
    const facingScale = this.direction.includes("west") ? -1 : 1;

    this.body.scale.x = facingScale;
    this.body.ellipse(0, 3, 12, 4).fill({ color: 0x1d2324, alpha: 0.22 });
    this.body.roundRect(-5, -11 + bob - stride, 5, 13, 2).fill(pantsColor);
    this.body.roundRect(2, -11 + bob + stride, 5, 13, 2).fill(pantsColor);
    this.body.roundRect(-9, -1 - stride, 9, 4, 2).fill(shoesColor);
    this.body.roundRect(1, -1 + stride, 10, 4, 2).fill(shoesColor);
    this.body.roundRect(-9, -29 + bob, 18, 21, 5).fill(shirtColor);
    this.drawTopDetail(shirtColor, bob);
    this.body.roundRect(-13, -26 + bob, 5, 15, 2).fill(skinTone);
    this.body.roundRect(8, -26 + bob, 5, 15, 2).fill(skinTone);
    this.body.circle(0, -38 + bob, 11).fill(skinTone);
    this.drawHair(hairColor, bob);
    this.drawFace(bob);
  }

  private drawTopDetail(color: number, bob: number): void {
    if (this.appearance.shirt === "hoodie") {
      this.body.roundRect(-6, -31 + bob, 12, 6, 3).fill(darken(color, 0.78));
      this.body.rect(-1, -26 + bob, 2, 15).fill(darken(color, 0.72));
      this.body.circle(-4, -23 + bob, 1).fill(0xf1e7d2);
      this.body.circle(4, -23 + bob, 1).fill(0xf1e7d2);
      return;
    }

    this.body.roundRect(-5, -29 + bob, 10, 4, 2).fill(darken(color, 0.78));
  }

  private drawFace(bob: number): void {
    if (
      this.direction === "north" ||
      this.direction === "north-east" ||
      this.direction === "north-west"
    ) {
      return;
    }

    this.body.circle(-4, -37 + bob, 1.5).fill(0x1d2324);
    this.body.circle(4, -37 + bob, 1.5).fill(0x1d2324);
    this.body.rect(-2, -32 + bob, 4, 1).fill(0x9d5f46);
  }

  private drawHair(color: number, bob: number): void {
    if (this.appearance.hair === "side-part") {
      this.body.circle(-2, -45 + bob, 9).fill(color);
      this.body.rect(-11, -43 + bob, 8, 6).fill(color);
      this.body.rect(5, -41 + bob, 7, 4).fill(color);
      return;
    }

    if (this.appearance.hair === "bob") {
      this.body.circle(0, -44 + bob, 10).fill(color);
      this.body.roundRect(-12, -40 + bob, 5, 15, 2).fill(color);
      this.body.roundRect(7, -40 + bob, 5, 15, 2).fill(color);
      return;
    }

    this.body.circle(0, -45 + bob, 9).fill(color);
    this.body.rect(-9, -43 + bob, 18, 5).fill(color);
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

function toPixiColor(value: string): number {
  if (!/^#[\da-fA-F]{6}$/.test(value)) {
    return 0xffffff;
  }

  return Number.parseInt(value.slice(1), 16);
}

function darken(color: number, amount: number): number {
  const red = Math.round(((color >> 16) & 0xff) * amount);
  const green = Math.round(((color >> 8) & 0xff) * amount);
  const blue = Math.round((color & 0xff) * amount);

  return (red << 16) + (green << 8) + blue;
}
