import React, { useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { TrackMeta, RoomState } from '../types';
import { Waveform } from './Waveform';

interface BottomPlayerProps {
  currentTrack?: TrackMeta;
  room?: RoomState;
  isHost: boolean;
  deviceId?: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  volumeState: number;
  currentTime: number;
  duration: number;
  onTogglePlay: (isPlaying: boolean) => void;
  onSeek: (time: number) => void;
  isScrubbing: boolean;
  scrubTime: number;
  onScrubChange: (time: number) => void;
  onScrubCommit: () => void;
}

export default function BottomPlayer({ 
  currentTrack, 
  room, 
  isHost, 
  deviceId,
  audioRef, 
  volumeState,
  currentTime,
  duration,
  onTogglePlay,
  onSeek,
  isScrubbing,
  scrubTime,
  onScrubChange,
  onScrubCommit
}: BottomPlayerProps) {
  const isPlaying = room?.isPlaying || false;

  const isLogicalHost = isHost || (room && room.hostId === deviceId);
  const canControl = !room || room.playbackPermission === 'everyone' || isLogicalHost;

  // Helper to turn seconds into clean 0:00 format
  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs) || secs < 0) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handlePlayPause = () => {
    if (!room || !canControl || !currentTrack) return;
    
    const willPlay = !isPlaying;
    const isYoutube = currentTrack.id?.startsWith("yt_") || (currentTrack.streamUrl && (currentTrack.streamUrl.includes("id=") || currentTrack.streamUrl.includes("/api/stream?id=")));

    if (isYoutube) {
      const yt = (window as any).activeYtPlayer;
      if (yt && typeof yt.playVideo === 'function') {
        try {
          if (willPlay) {
            yt.playVideo();
          } else {
            yt.pauseVideo();
          }
        } catch (e) {}
      }
    } else {
      if (audioRef.current) {
        if (willPlay) {
          audioRef.current.play()
            .then(() => { console.log("Playback started successfully on mobile device."); })
            .catch((error) => { 
               console.error("Playback failed, attempting asset reload: ", error);
               audioRef.current!.load();
               setTimeout(() => { audioRef.current!.play().catch(e => console.log("Final playback fallback blocked:", e)); }, 300);
            });
        } else {
          audioRef.current.pause();
        }
      }
    }

    onTogglePlay(willPlay);
  };

  const [isDragging, setIsDragging] = useState(false);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canControl || !isDragging) return;
    const targetTime = parseFloat(e.target.value);
    onScrubChange(targetTime);
  };

  const handlePointerDown = () => {
    setIsDragging(true);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    onScrubCommit();
  };

  if (!currentTrack) return null;

  return (
    <div className="fixed bottom-0 left-0 w-full z-50 p-4 pb-6 bg-[#0a0a0c]/80 backdrop-blur-2xl border-t border-white/5 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
      <div className="max-w-5xl mx-auto flex items-center gap-4">
        <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-neutral-800 shadow-lg relative">
          {currentTrack.thumbnail ? (
            <img src={currentTrack.thumbnail} alt={currentTrack.title} className="w-full h-full object-cover animate-fade-in" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-neutral-800">
              <span className="text-neutral-500 font-mono text-xs">AURA</span>
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0 flex flex-col justify-center font-sans">
          <h3 className="text-base font-bold text-white truncate drop-shadow-sm">{currentTrack.title}</h3>
          <p className="text-sm text-emerald-400 font-medium truncate mt-0.5 drop-shadow-sm">{currentTrack.artist}</p>
          
          <div className="flex items-center gap-3 w-full max-w-xl mx-auto px-4 mt-1">
            <span className="text-xs font-mono text-gray-400 select-none">{formatTime(Math.min(isScrubbing ? scrubTime : currentTime, duration))}</span>
            
            <div className="group relative w-full h-2">
              <input 
                type="range" 
                min="0" 
                max={duration || 0} 
                step="0.1"
                value={isScrubbing ? scrubTime : currentTime} 
                disabled={!canControl}
                onChange={handleSliderChange}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') onScrubCommit();
                }}
                className={`absolute inset-0 w-full h-full opacity-0 z-20 touch-none ${canControl ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              />
              
              {/* Waveform Canvas */}
              <div className={`relative w-full h-4 mt-[1px] rounded-sm overflow-hidden flex items-center transition-all group-hover:h-5 ${!canControl ? 'opacity-55' : ''}`}>
                 <Waveform progressPercent={(duration > 0 && isFinite(duration)) ? (Math.min(isScrubbing ? scrubTime : currentTime, duration) / duration) * 100 : 0} />
              </div>
            </div>
            
            <span className="text-xs font-mono text-gray-400 select-none">{formatTime(duration)}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4 pr-2">
          {canControl ? (
            <button
              onClick={handlePlayPause}
              className="w-12 h-12 rounded-full bg-white hover:bg-neutral-200 text-black flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer"
            >
              {isPlaying ? (
                <Pause size={24} className="fill-black" />
              ) : (
                <Play size={24} className="fill-black ml-1" />
              )}
            </button>
          ) : (
             <div className="flex flex-col items-end mr-4">
               <span className="text-xs font-mono text-emerald-400 tracking-widest uppercase">Sync Active</span>
               <span className="text-[10px] font-mono text-neutral-500">Host controls playback</span>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
