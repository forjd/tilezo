import { and, desc, eq, or } from "drizzle-orm";
import type { TilezoDatabase } from "../db/db";
import { directMessages } from "../db/schema";
import { createId } from "../util/ids";

export type DirectMessageRecord = {
  id: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  sentAt: string;
};

export const DEFAULT_DM_HISTORY_LIMIT = 50;
export const MAX_DM_HISTORY_LIMIT = 100;

export type DirectMessageStore = {
  save(message: {
    id: string;
    senderUserId: string;
    recipientUserId: string;
    body: string;
  }): Promise<DirectMessageRecord>;
  listConversation(
    userId: string,
    otherUserId: string,
    limit: number,
  ): Promise<DirectMessageRecord[]>;
};

// Friendship gate (injected): direct messages are only allowed between mutual friends.
type FriendshipCheck = (userId: string, otherUserId: string) => Promise<boolean>;
type BlockCheck = (userId: string, otherUserId: string) => Promise<boolean>;

export class DirectMessageError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class DirectMessageService {
  constructor(
    private readonly store: DirectMessageStore,
    private readonly areFriends: FriendshipCheck,
    private readonly isBlockedEitherDirection: BlockCheck = async () => false,
  ) {}

  async send(senderId: string, recipientId: string, text: string): Promise<DirectMessageRecord> {
    if (senderId === recipientId) {
      throw new DirectMessageError("INVALID_RECIPIENT", "You cannot message yourself");
    }

    await this.assertCanMessage(senderId, recipientId);

    return this.store.save({
      id: createId("dm"),
      senderUserId: senderId,
      recipientUserId: recipientId,
      body: text,
    });
  }

  async history(
    userId: string,
    otherUserId: string,
    limit = DEFAULT_DM_HISTORY_LIMIT,
  ): Promise<DirectMessageRecord[]> {
    await this.assertCanMessage(userId, otherUserId);

    const safeLimit = Math.max(
      1,
      Math.min(MAX_DM_HISTORY_LIMIT, Math.trunc(limit) || DEFAULT_DM_HISTORY_LIMIT),
    );
    return this.store.listConversation(userId, otherUserId, safeLimit);
  }

  async canMessage(userId: string, otherUserId: string): Promise<boolean> {
    try {
      await this.assertCanMessage(userId, otherUserId);
      return true;
    } catch (error) {
      if (error instanceof DirectMessageError) {
        return false;
      }

      throw error;
    }
  }

  async assertCanMessage(userId: string, otherUserId: string): Promise<void> {
    if (!(await this.areFriends(userId, otherUserId))) {
      throw new DirectMessageError("NOT_FRIENDS", "You can only message your friends");
    }

    if (await this.isBlockedEitherDirection(userId, otherUserId)) {
      throw new DirectMessageError("BLOCKED", "You cannot message this player");
    }
  }
}

const DM_COLUMNS = {
  id: directMessages.id,
  senderUserId: directMessages.senderUserId,
  recipientUserId: directMessages.recipientUserId,
  body: directMessages.body,
  createdAt: directMessages.createdAt,
} as const;

type DirectMessageRow = {
  id: string;
  senderUserId: string;
  recipientUserId: string;
  body: string;
  createdAt: Date;
};

export class DrizzleDirectMessageStore implements DirectMessageStore {
  constructor(private readonly db: TilezoDatabase) {}

  async save(message: {
    id: string;
    senderUserId: string;
    recipientUserId: string;
    body: string;
  }): Promise<DirectMessageRecord> {
    const [row] = await this.db.insert(directMessages).values(message).returning(DM_COLUMNS);

    if (!row) {
      throw new Error("Direct message insert failed");
    }

    return toRecord(row);
  }

  async listConversation(
    userId: string,
    otherUserId: string,
    limit: number,
  ): Promise<DirectMessageRecord[]> {
    const rows = await this.db
      .select(DM_COLUMNS)
      .from(directMessages)
      .where(
        or(
          and(
            eq(directMessages.senderUserId, userId),
            eq(directMessages.recipientUserId, otherUserId),
          ),
          and(
            eq(directMessages.senderUserId, otherUserId),
            eq(directMessages.recipientUserId, userId),
          ),
        ),
      )
      // Fetch the most recent `limit`, then return them oldest-first for display.
      .orderBy(desc(directMessages.createdAt))
      .limit(limit);

    return rows.reverse().map(toRecord);
  }
}

function toRecord(row: DirectMessageRow): DirectMessageRecord {
  return {
    id: row.id,
    fromUserId: row.senderUserId,
    toUserId: row.recipientUserId,
    text: row.body,
    sentAt: row.createdAt.toISOString(),
  };
}
