import { and, count, desc, eq, isNull, or } from "drizzle-orm";
import type { TilezoDatabase } from "../db/db";
import { directMessages } from "../db/schema";
import { createId } from "../util/ids";

// Direct messages are stored as server-readable plaintext so moderation/export/deletion workflows
// can operate today. This is not end-to-end encrypted; keep the feature friend-gated,
// block-aware, and documented as private to participants plus operators with database access.
export type DirectMessageRecord = {
  id: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  sentAt: string;
  readAt?: string;
  editedAt?: string;
  deletedAt?: string;
};

export type DirectMessageReadReceipt = {
  readerUserId: string;
  otherUserId: string;
  messageIds: string[];
  readAt: string;
};

export type DirectMessageUnreadCount = {
  friendId: string;
  count: number;
};

export type DirectMessageDeletedRecord = {
  id: string;
  fromUserId: string;
  toUserId: string;
  deletedAt: string;
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
  listUnreadCounts(userId: string): Promise<DirectMessageUnreadCount[]>;
  markConversationRead(
    readerUserId: string,
    otherUserId: string,
  ): Promise<DirectMessageReadReceipt>;
  findMessage(messageId: string): Promise<DirectMessageRecord | undefined>;
  editMessage(messageId: string, text: string): Promise<DirectMessageRecord>;
  deleteMessage(messageId: string): Promise<DirectMessageDeletedRecord>;
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

  async markRead(readerUserId: string, otherUserId: string): Promise<DirectMessageReadReceipt> {
    await this.assertCanMessage(readerUserId, otherUserId);
    return this.store.markConversationRead(readerUserId, otherUserId);
  }

  async unreadCounts(userId: string): Promise<DirectMessageUnreadCount[]> {
    const counts = await this.store.listUnreadCounts(userId);
    const visibleCounts: DirectMessageUnreadCount[] = [];

    for (const count of counts) {
      if (await this.canMessage(userId, count.friendId)) {
        visibleCounts.push(count);
      }
    }

    return visibleCounts;
  }

  async edit(senderUserId: string, messageId: string, text: string): Promise<DirectMessageRecord> {
    const message = await this.requireEditableMessage(senderUserId, messageId);
    await this.assertCanMessage(senderUserId, message.toUserId);
    return this.store.editMessage(messageId, text);
  }

  async delete(senderUserId: string, messageId: string): Promise<DirectMessageDeletedRecord> {
    const message = await this.requireEditableMessage(senderUserId, messageId);
    await this.assertCanMessage(senderUserId, message.toUserId);
    return this.store.deleteMessage(messageId);
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

  private async requireEditableMessage(
    senderUserId: string,
    messageId: string,
  ): Promise<DirectMessageRecord> {
    const message = await this.store.findMessage(messageId);

    if (!message) {
      throw new DirectMessageError("DM_NOT_FOUND", "Message not found");
    }

    if (message.fromUserId !== senderUserId) {
      throw new DirectMessageError("DM_NOT_OWNED", "You can only change your own messages");
    }

    if (message.deletedAt) {
      throw new DirectMessageError("DM_DELETED", "Message has already been deleted");
    }

    return message;
  }
}

const DM_COLUMNS = {
  id: directMessages.id,
  senderUserId: directMessages.senderUserId,
  recipientUserId: directMessages.recipientUserId,
  body: directMessages.body,
  createdAt: directMessages.createdAt,
  readAt: directMessages.readAt,
  editedAt: directMessages.editedAt,
  deletedAt: directMessages.deletedAt,
} as const;

type DirectMessageRow = {
  id: string;
  senderUserId: string;
  recipientUserId: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  editedAt: Date | null;
  deletedAt: Date | null;
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

  async findMessage(messageId: string): Promise<DirectMessageRecord | undefined> {
    const [row] = await this.db
      .select(DM_COLUMNS)
      .from(directMessages)
      .where(eq(directMessages.id, messageId))
      .limit(1);

    return row ? toRecord(row) : undefined;
  }

  async listUnreadCounts(userId: string): Promise<DirectMessageUnreadCount[]> {
    const rows = await this.db
      .select({
        friendId: directMessages.senderUserId,
        value: count(),
      })
      .from(directMessages)
      .where(
        and(
          eq(directMessages.recipientUserId, userId),
          isNull(directMessages.readAt),
          isNull(directMessages.deletedAt),
        ),
      )
      .groupBy(directMessages.senderUserId);

    return rows.map((row) => ({ friendId: row.friendId, count: row.value }));
  }

  async markConversationRead(
    readerUserId: string,
    otherUserId: string,
  ): Promise<DirectMessageReadReceipt> {
    const readAt = new Date();
    const rows = await this.db
      .update(directMessages)
      .set({ readAt })
      .where(
        and(
          eq(directMessages.senderUserId, otherUserId),
          eq(directMessages.recipientUserId, readerUserId),
          isNull(directMessages.readAt),
          isNull(directMessages.deletedAt),
        ),
      )
      .returning({ id: directMessages.id });

    return {
      readerUserId,
      otherUserId,
      messageIds: rows.map((row) => row.id),
      readAt: readAt.toISOString(),
    };
  }

  async editMessage(messageId: string, text: string): Promise<DirectMessageRecord> {
    const editedAt = new Date();
    const [row] = await this.db
      .update(directMessages)
      .set({ body: text, editedAt })
      .where(and(eq(directMessages.id, messageId), isNull(directMessages.deletedAt)))
      .returning(DM_COLUMNS);

    if (!row) {
      throw new Error("Direct message edit failed");
    }

    return toRecord(row);
  }

  async deleteMessage(messageId: string): Promise<DirectMessageDeletedRecord> {
    const deletedAt = new Date();
    const [row] = await this.db
      .update(directMessages)
      .set({ deletedAt })
      .where(and(eq(directMessages.id, messageId), isNull(directMessages.deletedAt)))
      .returning({
        id: directMessages.id,
        senderUserId: directMessages.senderUserId,
        recipientUserId: directMessages.recipientUserId,
        deletedAt: directMessages.deletedAt,
      });

    if (!row?.deletedAt) {
      throw new Error("Direct message delete failed");
    }

    return {
      id: row.id,
      fromUserId: row.senderUserId,
      toUserId: row.recipientUserId,
      deletedAt: row.deletedAt.toISOString(),
    };
  }
}

function toRecord(row: DirectMessageRow): DirectMessageRecord {
  return {
    id: row.id,
    fromUserId: row.senderUserId,
    toUserId: row.recipientUserId,
    text: row.deletedAt ? "" : row.body,
    sentAt: row.createdAt.toISOString(),
    ...(row.readAt ? { readAt: row.readAt.toISOString() } : {}),
    ...(row.editedAt ? { editedAt: row.editedAt.toISOString() } : {}),
    ...(row.deletedAt ? { deletedAt: row.deletedAt.toISOString() } : {}),
  };
}
