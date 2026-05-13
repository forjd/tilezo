import { createRectRoomLayout } from "@tilezo/engine";

export function createPersonalRoomLayout(user: { id: string; username: string }) {
  return createRectRoomLayout(
    personalRoomId(user.id),
    `${user.username}'s Room`,
    8,
    8,
    { x: 0, y: 2 },
    [
      { x: 5, y: 1 },
      { x: 5, y: 2 },
      { x: 5, y: 3 },
      { x: 1, y: 5 },
      { x: 2, y: 5 },
    ],
  );
}

export function personalRoomId(userId: string): string {
  return `home_${userId}`;
}
