import React, { useEffect, useRef, useState } from 'react';
import Peer, { DataConnection } from 'peerjs';

interface SongSyncPayload {
  type: 'SYNC_STATE' | 'PLAY' | 'PAUSE' | 'SEEK' | 'CHANGE_TRACK';
  trackId: string;
  isPlaying: boolean;
  playbackPosition: number; // in seconds
  timestamp: number;        // execution epoch millisecond
}

export const usePeerSongSync = (
  audioElementRef: React.RefObject<HTMLAudioElement | null>,
  currentTrackId: string,
  setCurrentTrackId: (id: string) => void
) => {
  const [peerId, setPeerId] = useState<string>('');
  const [roomCode, setRoomCode] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  
  const peerRef = useRef<Peer | null>(null);
  const connectionRef = useRef<DataConnection | null>(null);
  const syncIntervalRef = useRef<any | null>(null);

  // Initialize PeerJS 
  const initializePeer = (customRoomCode?: string) => {
    const code = customRoomCode || Math.floor(100000 + Math.random() * 900000).toString();
    setRoomCode(code);
    
    // Using free public cloud matchmaking broker infrastructure
    const peer = new Peer(`aurasync-room-${code}`);
    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      setIsConnected(true);
    });

    // Host Listener: When a Guest connects over direct data channel
    peer.on('connection', (conn) => {
      connectionRef.current = conn;
      setIsHost(true);
      handleConnectionLifecycle(conn);
    });
  };

  // Connect to a Room (Guest Mode)
  const joinRoom = (targetRoomCode: string) => {
    setIsHost(false);
    setRoomCode(targetRoomCode);
    
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', () => {
      const conn = peer.connect(`aurasync-room-${targetRoomCode}`);
      connectionRef.current = conn;
      handleConnectionLifecycle(conn);
    });
  };

  // Shared Connection Handler (WebSockets Replacement Data Pipe)
  const handleConnectionLifecycle = (conn: DataConnection) => {
    conn.on('open', () => {
      setIsConnected(true);
      if (isHost) startHostBroadcasting();
    });

    conn.on('data', (data: any) => {
      const payload = data as SongSyncPayload;
      handleIncomingSync(payload);
    });

    conn.on('close', () => {
      setIsConnected(false);
      stopHostBroadcasting();
    });
  };

  // Host Broadcaster Loop (Fires state frames every 1 second to the peer channel)
  const startHostBroadcasting = () => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    
    syncIntervalRef.current = setInterval(() => {
      const audio = audioElementRef.current;
      if (!audio || !connectionRef.current) return;

      const payload: SongSyncPayload = {
        type: 'SYNC_STATE',
        trackId: currentTrackId,
        isPlaying: !audio.paused,
        playbackPosition: audio.currentTime,
        timestamp: Date.now(),
      };
      
      connectionRef.current.send(payload);
    }, 1000);
  };

  const stopHostBroadcasting = () => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  };

  // Guest State Engine: Analyzes payload deltas and executes timeline adjustments
  const handleIncomingSync = (payload: SongSyncPayload) => {
    const audio = audioElementRef.current;
    if (!audio || isHost) return; // Host ignores incoming commands to protect sequence authority

    // 1. Resolve Track Changes
    if (payload.trackId !== currentTrackId) {
      setCurrentTrackId(payload.trackId);
    }

    // 2. Compute Latency/Delta Compensation
    const networkLatencySec = (Date.now() - payload.timestamp) / 1000;
    const targetPlaybackPosition = payload.playbackPosition + (payload.isPlaying ? networkLatencySec : 0);
    const localDriftDelta = Math.abs(audio.currentTime - targetPlaybackPosition);

    // 3. Execution Matrix
    if (payload.isPlaying && audio.paused) {
      audio.play()
        .then(() => { console.log("Playback started successfully on mobile device."); })
        .catch((error) => { 
           console.error("Playback failed, attempting asset reload: ", error);
           audio.load();
           // Fallback: Attempt a delayed play invocation if the initial hardware thread was busy
           setTimeout(() => { audio.play().catch(e => console.log("Final playback fallback blocked:", e)); }, 300);
        });
    } else if (!payload.isPlaying && !audio.paused) {
      audio.pause();
    }

    // Timeline Sync Jump Rule: Trigger jump if timeline drift exceeds a 1.5 second gap
    if (localDriftDelta > 1.5) {
      audio.currentTime = targetPlaybackPosition;
    }
  };

  // Manual Controls Outbound Emitters (Triggered on UI interactions like clicking Play/Pause)
  const emitAudioEvent = (type: 'PLAY' | 'PAUSE' | 'SEEK' | 'CHANGE_TRACK', customTrackId?: string) => {
    const audio = audioElementRef.current;
    if (!audio || !connectionRef.current || !isHost) return;

    const payload: SongSyncPayload = {
      type,
      trackId: customTrackId || currentTrackId,
      isPlaying: type === 'PLAY' || (type !== 'PAUSE' && !audio.paused),
      playbackPosition: audio.currentTime,
      timestamp: Date.now(),
    };

    connectionRef.current.send(payload);
  };

  useEffect(() => {
    return () => {
      stopHostBroadcasting();
      peerRef.current?.destroy();
    };
  }, []);

  return {
    peerId,
    roomCode,
    isConnected,
    isHost,
    initializePeer,
    joinRoom,
    emitAudioEvent,
  };
};
