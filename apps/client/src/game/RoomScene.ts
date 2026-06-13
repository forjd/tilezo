import { screenToTile, tileToScreen } from "@tilezo/engine/iso";
import type { RoomTile, TilePosition } from "@tilezo/engine/types";
import type { AvatarAppearance } from "@tilezo/protocol/appearance";
import type { RoomSnapshotMessage, ServerMessage } from "@tilezo/protocol/messages";
import { type Application, Container } from "pixi.js";
import { Avatar, type ChatBubbleLayout } from "./Avatar";
import { ROOM_WALL_HEIGHT, TileMap } from "./TileMap";

type MoveRequestHandler = (target: TilePosition) => void;
type CanvasInteractionHandler = () => void;
type Point = {
  x: number;
  y: number;
};

const MIN_CAMERA_SCALE = 0.5;
const MAX_CAMERA_SCALE = 2.25;
const DEFAULT_CAMERA_SCALE = 1;
const ZOOM_STEP = 0.0015;
const PAN_THRESHOLD_PIXELS = 4;
const KEYBOARD_PAN_PIXELS = 32;
const KEYBOARD_ZOOM_DELTA = 120;
const DOOR_LAYER_SWITCH_PROGRESS = 0.55;
const DOOR_LAYER_DISTANCE_TOLERANCE = 18;
const CHAT_BUBBLE_COLLISION_GAP = 6;
const CAMERA_SCALE_STORAGE_KEY = "tilezo.roomCameraScale";

export class RoomScene {
  private readonly world = new Container();
  private readonly tiles = new TileMap();
  private readonly doorAvatarLayer = new Container();
  private readonly avatarLayer = new Container();
  private readonly avatarOverlayLayer = new Container();
  private readonly avatars = new Map<string, Avatar>();
  private hover?: TilePosition;
  private doorTile?: TilePosition;
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
    this.world.addChild(
      this.tiles.view,
      this.doorAvatarLayer,
      this.tiles.wallView,
      this.avatarLayer,
      this.avatarOverlayLayer,
    );
    this.app.stage.addChild(this.world);
    this.centerWorld();
    this.bindPointer();
  }

  loadSnapshot(snapshot: RoomSnapshotMessage): void {
    this.tiles.load(snapshot.tiles);
    this.doorTile = this.tiles.getAttachedDoorTile();
    this.roomBounds = calculateRoomBounds(snapshot.tiles);
    this.resetCamera();
    this.clear();

    for (const user of snapshot.users) {
      const avatar = this.addAvatar(user.id, user.username, user.position, user.appearance);

      if (user.movementPath && user.movementPath.length > 1) {
        avatar.setPath(user.movementPath);
      }
    }
  }

  // Removes every avatar from the scene without tearing down the world/pointer bindings.
  // Used before a reconnect so stale avatars are not left animating until (or unless) a
  // fresh snapshot arrives.
  clear(): void {
    for (const avatar of this.avatars.values()) {
      avatar.destroy();
    }
    this.doorAvatarLayer.removeChildren();
    this.avatarLayer.removeChildren();
    this.avatarOverlayLayer.removeChildren();
    this.avatars.clear();
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
      this.placeAvatarBody(avatar);
    }

    this.layoutChatBubbles();
  }

  resize(): void {
    this.centerRoom();
  }

  private addAvatar(
    userId: string,
    username: string,
    position: TilePosition,
    appearance: AvatarAppearance,
  ): Avatar {
    this.removeAvatar(userId);
    const avatar = new Avatar(userId, username, position, appearance);
    this.avatars.set(userId, avatar);
    this.placeAvatarBody(avatar);
    this.avatarOverlayLayer.addChild(avatar.overlayView);
    return avatar;
  }

  private removeAvatar(userId: string): void {
    const avatar = this.avatars.get(userId);

    if (!avatar) {
      return;
    }

    avatar.view.removeFromParent();
    avatar.overlayView.removeFromParent();
    avatar.destroy();
    this.avatars.delete(userId);
  }

  private placeAvatarBody(avatar: Avatar): void {
    const targetLayer = this.shouldRenderBehindDoorWall(avatar)
      ? this.doorAvatarLayer
      : this.avatarLayer;

    if (avatar.view.parent !== targetLayer) {
      targetLayer.addChild(avatar.view);
    }
  }

  private layoutChatBubbles(): void {
    const placed: ChatBubbleLayout[] = [];
    const layouts = [...this.avatars.values()]
      .flatMap((avatar) => avatar.getChatBubbleLayouts())
      .sort((a, b) => b.bottom - a.bottom);

    for (const layout of layouts) {
      let offset = 0;
      let top = layout.top;
      let bottom = layout.bottom;

      for (const other of placed) {
        if (!rectsOverlap({ ...layout, top, bottom }, other)) {
          continue;
        }

        const nextOffset = bottom - other.top + CHAT_BUBBLE_COLLISION_GAP;
        offset += nextOffset;
        top -= nextOffset;
        bottom -= nextOffset;
      }

      layout.setCollisionOffset(offset);
      placed.push({ ...layout, top, bottom });
    }
  }

  private shouldRenderBehindDoorWall(avatar: Avatar): boolean {
    const doorTile = this.doorTile;

    if (!doorTile || doorTile.x >= 0) {
      return false;
    }

    const door = tileToScreen(doorTile.x, doorTile.y);
    const roomSide = tileToScreen(doorTile.x + 1, doorTile.y);
    const segment = {
      x: roomSide.x - door.x,
      y: roomSide.y - door.y,
    };
    const segmentLengthSquared = segment.x ** 2 + segment.y ** 2;

    if (segmentLengthSquared === 0) {
      return false;
    }

    const avatarOffset = {
      x: avatar.view.x - door.x,
      y: avatar.view.y - door.y,
    };
    const progress =
      (avatarOffset.x * segment.x + avatarOffset.y * segment.y) / segmentLengthSquared;
    const distanceFromDoorPath =
      Math.abs(avatarOffset.x * segment.y - avatarOffset.y * segment.x) /
      Math.sqrt(segmentLengthSquared);

    return (
      progress <= DOOR_LAYER_SWITCH_PROGRESS &&
      distanceFromDoorPath <= DOOR_LAYER_DISTANCE_TOLERANCE
    );
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
    this.world.scale.set(readStoredCameraScale());
    this.centerRoom();
  }

  private bindPointer(): void {
    const canvas = this.app.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Tilezo room");
    canvas.setAttribute("role", "application");

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
      canvas.focus({ preventScroll: true });
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

    this.listen(canvas, "keydown", (event) => {
      this.handleKeyboard(event);
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
    this.applyZoom(point, worldPoint, event.deltaY);
  }

  private zoomAtScreenCenter(deltaY: number): void {
    const point = {
      x: this.app.screen.width / 2,
      y: this.app.screen.height / 2,
    };
    const scale = this.world.scale.x;
    const worldPoint = {
      x: (point.x - this.world.x) / scale,
      y: (point.y - this.world.y) / scale,
    };

    this.applyZoom(point, worldPoint, deltaY);
  }

  private applyZoom(point: Point, worldPoint: Point, deltaY: number): void {
    const nextScale = clamp(
      this.world.scale.x * (1 - deltaY * ZOOM_STEP),
      MIN_CAMERA_SCALE,
      MAX_CAMERA_SCALE,
    );

    this.world.scale.set(nextScale);
    this.world.x = point.x - worldPoint.x * nextScale;
    this.world.y = point.y - worldPoint.y * nextScale;
    writeStoredCameraScale(nextScale);
  }

  private handleKeyboard(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      if (this.hover && this.tiles.isWalkable(this.hover)) {
        event.preventDefault();
        this.onMoveRequest(this.hover);
        this.onCanvasInteraction?.();
      }

      return;
    }

    const pan = keyboardPanDelta(event.key);

    if (pan) {
      event.preventDefault();
      this.world.x += pan.x;
      this.world.y += pan.y;
      return;
    }

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      this.zoomAtScreenCenter(-KEYBOARD_ZOOM_DELTA);
      return;
    }

    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      this.zoomAtScreenCenter(KEYBOARD_ZOOM_DELTA);
    }
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

function keyboardPanDelta(key: string): Point | undefined {
  if (key === "ArrowLeft") {
    return { x: KEYBOARD_PAN_PIXELS, y: 0 };
  }

  if (key === "ArrowRight") {
    return { x: -KEYBOARD_PAN_PIXELS, y: 0 };
  }

  if (key === "ArrowUp") {
    return { x: 0, y: KEYBOARD_PAN_PIXELS };
  }

  if (key === "ArrowDown") {
    return { x: 0, y: -KEYBOARD_PAN_PIXELS };
  }

  return undefined;
}

function readStoredCameraScale(): number {
  try {
    const raw = globalThis.localStorage?.getItem(CAMERA_SCALE_STORAGE_KEY);
    const scale = raw ? Number.parseFloat(raw) : DEFAULT_CAMERA_SCALE;

    if (!Number.isFinite(scale)) {
      return DEFAULT_CAMERA_SCALE;
    }

    return clamp(scale, MIN_CAMERA_SCALE, MAX_CAMERA_SCALE);
  } catch {
    return DEFAULT_CAMERA_SCALE;
  }
}

function writeStoredCameraScale(scale: number): void {
  try {
    globalThis.localStorage?.setItem(CAMERA_SCALE_STORAGE_KEY, String(scale));
  } catch {
    // Private browsing or storage quota errors should not block room navigation.
  }
}

function rectsOverlap(
  a: Pick<ChatBubbleLayout, "left" | "right" | "top" | "bottom">,
  b: Pick<ChatBubbleLayout, "left" | "right" | "top" | "bottom">,
): boolean {
  return (
    a.left < b.right + CHAT_BUBBLE_COLLISION_GAP &&
    a.right > b.left - CHAT_BUBBLE_COLLISION_GAP &&
    a.top < b.bottom + CHAT_BUBBLE_COLLISION_GAP &&
    a.bottom > b.top - CHAT_BUBBLE_COLLISION_GAP
  );
}
