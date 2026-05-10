import { screenToTile, type TilePosition } from "@tilezo/engine";
import type { RoomSnapshotMessage, ServerMessage } from "@tilezo/protocol";
import { type Application, Container } from "pixi.js";
import { Avatar } from "./Avatar";
import { TileMap } from "./TileMap";

type MoveRequestHandler = (target: TilePosition) => void;

export class RoomScene {
  private readonly world = new Container();
  private readonly tiles = new TileMap();
  private readonly avatarLayer = new Container();
  private readonly avatars = new Map<string, Avatar>();
  private hover?: TilePosition;

  constructor(
    private readonly app: Application,
    private readonly onMoveRequest: MoveRequestHandler,
  ) {
    this.world.addChild(this.tiles.view, this.avatarLayer);
    this.app.stage.addChild(this.world);
    this.centerWorld();
    this.bindPointer();
  }

  loadSnapshot(snapshot: RoomSnapshotMessage): void {
    this.tiles.load(snapshot.tiles);
    this.avatarLayer.removeChildren();
    this.avatars.clear();

    for (const user of snapshot.users) {
      this.addAvatar(user.id, user.username, user.position);
    }
  }

  handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case "room.snapshot":
        this.loadSnapshot(message);
        break;
      case "user.joined":
        this.addAvatar(message.user.id, message.user.username, message.user.position);
        break;
      case "user.left":
        this.removeAvatar(message.userId);
        break;
      case "avatar.moved":
        this.avatars.get(message.userId)?.setPath(message.path);
        break;
    }
  }

  update(deltaSeconds: number): void {
    for (const avatar of this.avatars.values()) {
      avatar.update(deltaSeconds);
    }
  }

  resize(): void {
    this.centerWorld();
  }

  private addAvatar(userId: string, username: string, position: TilePosition): void {
    this.removeAvatar(userId);
    const avatar = new Avatar(userId, username, position);
    this.avatars.set(userId, avatar);
    this.avatarLayer.addChild(avatar.view);
  }

  private removeAvatar(userId: string): void {
    const avatar = this.avatars.get(userId);

    if (!avatar) {
      return;
    }

    avatar.view.removeFromParent();
    this.avatars.delete(userId);
  }

  private centerWorld(): void {
    this.world.x = this.app.screen.width / 2;
    this.world.y = 120;
  }

  private bindPointer(): void {
    const canvas = this.app.canvas;

    canvas.addEventListener("mousemove", (event) => {
      this.hover = this.eventToTile(event);
      this.tiles.setHover(this.hover);
    });

    canvas.addEventListener("mouseleave", () => {
      this.hover = undefined;
      this.tiles.setHover(undefined);
    });

    canvas.addEventListener("click", (event) => {
      const target = this.eventToTile(event);

      if (this.tiles.isWalkable(target)) {
        this.onMoveRequest(target);
      }
    });
  }

  private eventToTile(event: MouseEvent): TilePosition {
    const rect = this.app.canvas.getBoundingClientRect();
    const worldX = event.clientX - rect.left - this.world.x;
    const worldY = event.clientY - rect.top - this.world.y;
    return screenToTile(worldX, worldY);
  }
}
