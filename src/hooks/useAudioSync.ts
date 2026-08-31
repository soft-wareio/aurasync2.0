import { useState, useEffect, useRef } from 'react';
import { RoomState } from '../types';
import { subscribeToRoom } from '../lib/p2p';

export function useAudioSync(roomCode: string, deviceId: string, isHost: boolean, volumeState: number = 80) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!roomCode) {
      setRoom(null);
      return;
    }
    
    const unsubscribe = subscribeToRoom(
      roomCode,
      (state) => {
        setRoom(state);
      },
      (err) => {
        console.error('[AuraSync] Observer Error:', err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [roomCode]);

  const handleEnded = () => {};
  const handleCanPlayThrough = () => {};
  const handleWaiting = () => {};

  return {
    room,
    audioRef,
    isBuffering: false,
    prebufferTimeLeft: null,
    handleEnded,
    handleCanPlayThrough,
    handleWaiting
  };
}
