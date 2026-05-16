export type UserPresence = {
  online: boolean;
  roomId?: string;
};

type ConnectionPresence = {
  connectionId: string;
  roomId?: string;
};

export class PresenceTracker {
  private readonly connections = new Map<string, Map<string, ConnectionPresence>>();

  connect(userId: string, connectionId: string): void {
    const userConnections = this.connections.get(userId) ?? new Map<string, ConnectionPresence>();
    userConnections.set(connectionId, { connectionId });
    this.connections.set(userId, userConnections);
  }

  joinRoom(userId: string, connectionId: string, roomId: string): void {
    const userConnections = this.connections.get(userId);
    const connection = userConnections?.get(connectionId);

    if (!connection) {
      this.connect(userId, connectionId);
    }

    const joinedConnection = this.connections.get(userId)?.get(connectionId);

    if (joinedConnection) {
      joinedConnection.roomId = roomId;
    }
  }

  disconnect(userId: string, connectionId: string): void {
    const userConnections = this.connections.get(userId);

    if (!userConnections) {
      return;
    }

    userConnections.delete(connectionId);

    if (userConnections.size === 0) {
      this.connections.delete(userId);
    }
  }

  get(userId: string): UserPresence {
    const userConnections = this.connections.get(userId);

    if (!userConnections || userConnections.size === 0) {
      return { online: false };
    }

    const roomId = [...userConnections.values()].find((connection) => connection.roomId)?.roomId;
    return roomId ? { online: true, roomId } : { online: true };
  }
}
