import React, { createContext, useContext, useEffect, useState } from 'react';
import { SongTrack } from '../lib/musicSearch';
import { TrackMeta, RoomState } from '../types';
import { addTrackToQueue, removeTrackFromQueue, updateRoomPlayerState } from '../lib/p2p';
import { syncEngine } from '../lib/syncEngine';

export interface QueueState {
  queue: SongTrack[];
  addToQueue: (track: SongTrack) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  playNext: () => void;
}

const QueueContext = createContext<QueueState | undefined>(undefined);

export function useQueue() {
  const context = useContext(QueueContext);
  if (!context) {
    throw new Error('useQueue must be used within an AudioQueueProvider');
  }
  return context;
}

interface AudioQueueProviderProps {
  children: React.ReactNode;
  room: RoomState | null;
  isHost: boolean;
}

export function AudioQueueProvider({ children, room, isHost }: AudioQueueProviderProps) {
  const [queue, setQueue] = useState<SongTrack[]>([]);

  // Keep internal state mapped from room queue
  useEffect(() => {
    if (!room?.queue) {
      setQueue([]);
      return;
    }

    const mapped: SongTrack[] = room.queue.map(track => ({
      id: track.id,
      name: track.title,
      artist: track.artist,
      url: track.streamUrl,
      image: track.thumbnail || '',
      duration: track.duration || 180
    }));

    setQueue(mapped);
  }, [room?.queue]);

  const addToQueue = async (track: SongTrack) => {
    if (!room) return;
    const meta: TrackMeta = {
      id: track.id,
      title: track.name,
      artist: track.artist,
      streamUrl: track.url,
      thumbnail: track.image,
      duration: track.duration
    };
    await addTrackToQueue(room.code, meta);
    // UI feedback handled in LibrarySearch.tsx via callback
  };

  const removeFromQueue = async (id: string) => {
    if (!room) return;
    const targetMeta = room.queue?.find(t => t.id === id);
    if (targetMeta) {
      await removeTrackFromQueue(room.code, targetMeta);
    } else {
      const updatedList = room.queue?.filter(t => t.id !== id) || [];
      await updateRoomPlayerState(
        room.code,
        room.isPlaying,
        room.startTime,
        room.pauseOffset,
        room.audioSource,
        room.currentTrack,
        updatedList
      );
    }
  };

  const clearQueue = async () => {
    if (!room) return;
    await updateRoomPlayerState(
      room.code,
      room.isPlaying,
      room.startTime,
      room.pauseOffset,
      room.audioSource,
      room.currentTrack,
      []
    );
  };

  const playNext = async () => {
    if (!room || !room.queue || room.queue.length === 0) return;
    
    // Auto-play is a privileged action
    const canControl = isHost || room.playbackPermission === 'everyone';
    
    // If not host, maybe only host should trigger next song?
    // User requested "automated queue", imply host-triggered.
    if (!isHost) return; 

    const nextTrack = room.queue[0];
    const remainingQueue = room.queue.slice(1);

    await updateRoomPlayerState(
      room.code,
      true,
      syncEngine.getSynchronizedTime(),
      0,
      nextTrack.streamUrl,
      nextTrack,
      remainingQueue
    );
  };

  return (
    <QueueContext.Provider value={{ queue, addToQueue, removeFromQueue, clearQueue, playNext }}>
      {children}
    </QueueContext.Provider>
  );
}
