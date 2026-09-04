/**
 * In-memory room store.
 *
 * MVP only: rooms live in process memory. For multi-instance deployments,
 * swap with Redis. Rooms are evicted when the API restarts; this is acceptable
 * for the MVP since recordings (Phase 4) are persisted to disk anyway.
 */
import { MAX_PARTICIPANTS_MVP, type Participant, type Room, type RoomCode } from '@futuremode/shared';

class RoomStore {
  private rooms = new Map<RoomCode, Room>();
  private participants = new Map<RoomCode, Map<string, Participant>>();

  create(code: RoomCode, createdBy: string): Room {
    const room: Room = {
      code,
      createdAt: Date.now(),
      createdBy,
      participantCount: 0,
      isActive: true,
    };
    this.rooms.set(code, room);
    this.participants.set(code, new Map());
    return room;
  }

  get(code: RoomCode): Room | undefined {
    return this.rooms.get(code);
  }

  listParticipants(code: RoomCode): Participant[] {
    return Array.from(this.participants.get(code)?.values() ?? []);
  }

  /**
   * Atomically add a participant if the room exists and is not full.
   * Returns the participant on success, or null on failure.
   */
  addParticipant(code: RoomCode, p: Participant): Participant | null {
    const room = this.rooms.get(code);
    const participants = this.participants.get(code);
    if (!room || !participants || !room.isActive) return null;
    if (participants.has(p.identity)) {
      // Re-join: update joinedAt, return existing.
      const existing = participants.get(p.identity);
      if (existing) {
        existing.leftAt = undefined;
        existing.displayName = p.displayName;
        return existing;
      }
    }
    if (room.participantCount >= (process.env.MAX_PARTICIPANTS ? Number(process.env.MAX_PARTICIPANTS) : MAX_PARTICIPANTS_MVP)) {
      return null;
    }
    participants.set(p.identity, p);
    room.participantCount = participants.size;
    return p;
  }

  removeParticipant(code: RoomCode, identity: string): void {
    const room = this.rooms.get(code);
    const participants = this.participants.get(code);
    if (!room || !participants) return;
    const p = participants.get(identity);
    if (p) {
      p.leftAt = Date.now();
    }
    room.participantCount = participants.size;
    if (room.participantCount === 0) {
      room.isActive = false;
    }
  }

  endRoom(code: RoomCode): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.isActive = false;
    room.endedAt = Date.now();
  }

  has(code: RoomCode): boolean {
    const room = this.rooms.get(code);
    return Boolean(room && room.isActive);
  }

  list(): Room[] {
    return Array.from(this.rooms.values()).filter((r) => r.isActive);
  }
}

// Singleton — survives across HMR reloads in dev.
declare global {
  // eslint-disable-next-line no-var
  var __futuremodeRoomStore: RoomStore | undefined;
}

export const roomStore: RoomStore = globalThis.__futuremodeRoomStore ?? new RoomStore();
if (!globalThis.__futuremodeRoomStore) {
  globalThis.__futuremodeRoomStore = roomStore;
}
