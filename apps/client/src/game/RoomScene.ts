import { screenToTile, tileToScreen } from "@tilezo/engine/iso";
import type { RoomTile, TilePosition } from "@tilezo/engine/types";
import type { AvatarAppearance } from "@tilezo/protocol/appearance";
import type { RoomSnapshotMessage, ServerMessage } from "@tilezo/protocol/messages";
import { type Application, Container } from "pixi.js";
import { Avatar } from "./Avatar";
import { ROOM_WALL_HEIGHT, TileMap } from "./TileMap";

type MoveRequestHandler = (target: TilePosition) => void;
type CanvasInteractionHandler = () => void;
type Point = {
  x: number;
  y: number;
};

const MIN_CAMERA_SCALE = 0.5;
const MAX_CAMERA_SCALE = 2.25;
const ZOOM_STEP = 0.0015;
const PAN_THRESHOLD_PIXELS = 4;

export class RoomScene {
  private readonly world = new Container();
  private readonly tiles = new TileMap();
  private readonly avatarLayer = new Container();
  private readonly avatars = new Map<string, Avatar>();
  private hover?: TilePosition;
  private roomBounds?: RoomBounds;
  private dragStart?: Point;
  private dragWorldStart?: Point;
  private isPanning = false;
  private suppressNextClick = false;
  private canvasRect?: Pick<DOMRect, "left" | "top">;
  private readonly removePointerListeners: (() => void)[] = [];

  constructor(
    private readonly app: Application,
    private readonly onMoveRequest: MoveRequestHandler,
    private readonly onCanvasInteraction?: CanvasInteractionHandler,
  ) {
    this.world.addChild(this.tiles.view, this.avatarLayer);
    this.app.stage.addChild(this.world);
    this.centerWorld();
    this.bindPointer();
  }

  loadSnapshot(snapshot: RoomSnapshotMessage): void {
    this.tiles.load(snapshot.tiles);
    this.roomBounds = calculateRoomBounds(snapshot.tiles);
    this.resetCamera();
    for (const avatar of this.avatars.values()) {
      avatar.destroy();
    }
    this.avatarLayer.removeChildren();
    this.avatars.clear();

    for (const user of snapshot.users) {
      this.addAvatar(user.id, user.username, user.position, user.appearance);
    }
  }

  handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case "room.snapshot":
        this.loadSnapshot(message);
        break;
      case "user.joined":
        this.addAvatar(
          message.user.id,
          message.user.username,
          message.user.position,
          message.user.appearance,
        );
        break;
      case "user.left":
        this.removeAvatar(message.userId);
        break;
      case "avatar.moved":
        this.avatars.get(message.userId)?.setPath(message.path);
        break;
      case "avatar.appearance.updated":
        this.avatars.get(message.userId)?.setAppearance(message.appearance);
        break;
      case "chat.message":
        this.avatars.get(message.userId)?.setTyping(false);
        this.avatars.get(message.userId)?.say(message.text);
        break;
      case "chat.typing":
        this.avatars.get(message.userId)?.setTyping(message.isTyping);
        break;
    }
  }

  update(deltaSeconds: number): void {
    for (const avatar of this.avatars.values()) {
      avatar.update(deltaSeconds);
    }
  }

  resize(): void {
    this.centerRoom();
  }

  private addAvatar(
    userId: string,
    username: string,
    position: TilePosition,
    appearance: AvatarAppearance,
  ): void {
    this.removeAvatar(userId);
    const avatar = new Avatar(userId, username, position, appearance);
    this.avatars.set(userId, avatar);
    this.avatarLayer.addChild(avatar.view);
  }

  private removeAvatar(userId: string): void {
    const avatar = this.avatars.get(userId);

    if (!avatar) {
      return;
    }

    avatar.view.removeFromParent();
    avatar.destroy();
    this.avatars.delete(userId);
  }

  private centerWorld(): void {
    this.world.x = this.app.screen.width / 2;
    this.world.y = 120;
  }

  private centerRoom(): void {
    if (!this.roomBounds) {
      this.centerWorld();
      return;
    }

    const scale = this.world.scale.x;
    this.world.x = this.app.screen.width / 2 - this.roomBounds.center.x * scale;
    this.world.y = this.app.screen.height / 2 - this.roomBounds.center.y * scale;
  }

  private resetCamera(): void {
    this.world.scale.set(1);
    this.centerRoom();
  }

  private bindPointer(): void {
    const canvas = this.app.canvas;

    this.listen(canvas, "mousemove", (event) => {
      this.updatePan(event);
      this.hover = this.eventToTile(event);
      this.tiles.setHover(this.hover);
    });

    this.listen(canvas, "mouseleave", () => {
      this.endPan();
      this.hover = undefined;
      this.tiles.setHover(undefined);
    });

    this.listen(canvas, "mousedown", (event) => {
      event.preventDefault();
      this.dragStart = this.eventToCanvasPoint(event);
      this.dragWorldStart = { x: this.world.x, y: this.world.y };
      this.isPanning = false;
      this.onCanvasInteraction?.();
    });

    this.listen(canvas, "mouseup", () => {
      this.endPan();
    });

    this.listen(canvas, "click", (event) => {
      if (this.suppressNextClick) {
        event.preventDefault();
        this.suppressNextClick = false;
        return;
      }

      const target = this.eventToTile(event);

      if (this.tiles.isWalkable(target)) {
        this.onMoveRequest(target);
      }

      this.onCanvasInteraction?.();
    });

    this.listen(canvas, "wheel", (event) => {
      event.preventDefault();
      this.zoomAt(event);
    });
  }

  private listen<K extends keyof HTMLElementEventMap>(
    canvas: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
  ): void {
    canvas.addEventListener(type, listener);
    this.removePointerListeners.push(() => canvas.removeEventListener(type, listener));
  }

  private eventToTile(event: MouseEvent): TilePosition {
    const world = this.eventToWorldPoint(event);
    return screenToTile(world.x, world.y);
  }

  private eventToCanvasPoint(event: MouseEvent): Point {
    const rect = this.canvasRect ?? this.app.canvas.getBoundingClientRect();
    this.canvasRect = rect;
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private eventToWorldPoint(event: MouseEvent): Point {
    const point = this.eventToCanvasPoint(event);
    const scale = this.world.scale.x;
    return {
      x: (point.x - this.world.x) / scale,
      y: (point.y - this.world.y) / scale,
    };
  }

  private updatePan(event: MouseEvent): void {
    if (!this.dragStart || !this.dragWorldStart) {
      return;
    }

    const current = this.eventToCanvasPoint(event);
    const delta = {
      x: current.x - this.dragStart.x,
      y: current.y - this.dragStart.y,
    };

    if (!this.isPanning && Math.hypot(delta.x, delta.y) < PAN_THRESHOLD_PIXELS) {
      return;
    }

    this.isPanning = true;
    this.suppressNextClick = true;
    this.world.x = this.dragWorldStart.x + delta.x;
    this.world.y = this.dragWorldStart.y + delta.y;
    event.preventDefault();
  }

  private endPan(): void {
    this.dragStart = undefined;
    this.dragWorldStart = undefined;
    this.isPanning = false;
  }

  private zoomAt(event: WheelEvent): void {
    const point = this.eventToCanvasPoint(event);
    const worldPoint = this.eventToWorldPoint(event);
    const nextScale = clamp(
      this.world.scale.x * (1 - event.deltaY * ZOOM_STEP),
      MIN_CAMERA_SCALE,
      MAX_CAMERA_SCALE,
    );

    this.world.scale.set(nextScale);
    this.world.x = point.x - worldPoint.x * nextScale;
    this.world.y = point.y - worldPoint.y * nextScale;
  }

  destroy(): void {
    for (const remove of this.removePointerListeners.splice(0)) {
      remove();
    }

    for (const avatar of this.avatars.values()) {
      avatar.destroy();
    }
    this.avatars.clear();
    this.tiles.destroy();
    this.world.destroy({ children: true });
  }
}

type RoomBounds = {
  center: Point;
};

function calculateRoomBounds(tiles: RoomTile[]): RoomBounds | undefined {
  if (tiles.length === 0) {
    return undefined;
  }

  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  for (const tile of tiles) {
    const screen = tileToScreen(tile.x, tile.y);
    bounds.minX = Math.min(bounds.minX, screen.x - 32);
    bounds.maxX = Math.max(bounds.maxX, screen.x + 32);
    bounds.minY = Math.min(bounds.minY, screen.y - 16 - ROOM_WALL_HEIGHT);
    bounds.maxY = Math.max(bounds.maxY, screen.y + 16);
  }

  return {
    center: {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
