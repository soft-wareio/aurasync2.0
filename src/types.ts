/**
 * AuraSync - Shared Type Definitions
 */

export interface DeviceInfo {
  id: string;
  name: string;
  isHost: boolean;
  ping: number;
  offset: number;     // Clock offset relative to host/server (ms)
  x: number;          // Spatial coordinate X (0 to 100)
  y: number;          // Spatial coordinate Y (0 to 100)
  volume: number;      // Calculated spatial volume (0 to 1)
  lastActive: number; // For clean-up / heartbeat
  spatialRole?: 'left' | 'right' | 'center' | 'surround-left' | 'surround-right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  spatialAudioEnabled?: boolean; // Participant toggle
}

export interface TrackMeta {
  id: string;
  title: string;
  artist: string;
  thumbnail?: string;
  streamUrl: string;
  duration?: number;
}

export interface RoomState {
  code: string;
  isPlaying: boolean;
  audioSource: string; // URL to the sync track
  currentTrack?: TrackMeta; // Full track details
  queue?: TrackMeta[]; // List of queued tracks
  history?: TrackMeta[]; // List of previously played tracks
  startTime: number;   // Epoch timestamp when playback started (or paused)
  pauseOffset: number; // Seek position (in ms) when paused
  hostId: string;      // ID of the room creator/host
  playbackPermission?: 'everyone' | 'admins';
  spatialSetupActive?: boolean; // NEW: Should only be turned on by the host
  devices: {
    [deviceId: string]: DeviceInfo;
  };
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}
