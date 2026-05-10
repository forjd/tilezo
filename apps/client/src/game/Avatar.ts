import { type TilePosition, tileToScreen } from "@tilezo/engine";
import { Container, Graphics, Text } from "pixi.js";

const AVATAR_COLORS = [0x65d0ff, 0xffc857, 0x93e088, 0xff7b9c, 0xb892ff, 0xff9f43];

type ScreenPosition = {
  x: number;
  y: number;
};

export class Avatar {
  readonly view = new Container();
  readonly userId: string;
  username: string;
  position: TilePosition;

  private readonly body = new Graphics();
  private readonly label: Text;
  private path: TilePosition[] = [];
  private from: TilePosition;
  private fromScreen: ScreenPosition;
  private to?: TilePosition;
  private progress = 0;
  private readonly secondsPerTile = 0.36;

  constructor(userId: string, username: string, position: TilePosition) {
    this.userId = userId;
    this.username = username;
    this.position = { ...position };
    this.from = { ...position };
    this.fromScreen = tileToScreen(position.x, position.y);

    this.label = new Text({
      text: username,
      style: {
        align: "center",
        fill: 0xffffff,
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 12,
        fontWeight: "700",
        stroke: { color: 0x111821, width: 4 },
      },
    });

    this.label.anchor.set(0.5, 1);
    this.label.y = -34;

    const color = AVATAR_COLORS[Math.abs(hashCode(userId)) % AVATAR_COLORS.length] ?? 0x65d0ff;
    this.body.circle(0, -18, 12).fill(color);
    this.body.roundRect(-7, -18, 14, 22, 5).fill(color);
    this.body.circle(-4, -21, 2).fill(0x102032);
    this.body.circle(4, -21, 2).fill(0x102032);

    this.view.addChild(this.body, this.label);
    this.syncViewToTile(position);
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
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function sameTile(a: TilePosition, b: TilePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

function hashCode(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return hash;
}
