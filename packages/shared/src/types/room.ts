/**
 * Room-related types shared between web, api, and ai-bot.
 */

export type RoomCode = string; // 6-char base32

export interface Room {
  code: RoomCode;
  createdAt: number; // unix ms
  createdBy: string; // user identity
  participantCount: number;
  isActive: boolean;
  endedAt?: number;
}

export interface Participant {
  identity: string;
  displayName: string;
  joinedAt: number;
  leftAt?: number;
  isAI?: boolean;
}

export interface CreateRoomRequest {
  displayName: string;
}

export interface CreateRoomResponse {
  code: RoomCode;
  token: string;
  identity: string;
  livekitUrl: string;
}

export interface JoinRoomRequest {
  code: RoomCode;
  displayName: string;
}

export interface JoinRoomResponse {
  token: string;
  identity: string;
  livekitUrl: string;
  participants: Participant[];
}
