import React from 'react';
import { motion, Reorder, useDragControls } from 'motion/react';
import { Play, Trash2, Music, ListMusic, Volume2, GripVertical } from 'lucide-react';
import { RoomState, TrackMeta } from '../types';
import { removeTrackFromQueue, updateRoomPlayerState } from '../lib/p2p';
import { syncEngine } from '../lib/syncEngine';
import { useQueue } from '../context/AudioContext';

interface QueueListProps {
  room: RoomState;
  isHost: boolean;
}

export default function QueueList({ room, isHost }: QueueListProps) {
  const queue = room.queue || [];
  const currentTrack = room.currentTrack;
  const canControl = isHost || room.playbackPermission === 'everyone';
  const { clearQueue } = useQueue();
  const controls = useDragControls();

  const handleRemove = async (track: TrackMeta) => {
    if (!canControl) return;
    await removeTrackFromQueue(room.code, track);
  };

  const handleReorder = async (newQueue: TrackMeta[]) => {
    if (!canControl) return;
    await updateRoomPlayerState(
      room.code,
      room.isPlaying,
      room.startTime,
      room.pauseOffset,
      room.audioSource,
      room.currentTrack,
      newQueue
    );
  };

  const handlePlayNow = async (track: TrackMeta) => {
    if (!canControl) return;
    
    await updateRoomPlayerState(
      room.code, 
      true, 
      syncEngine.getSynchronizedTime(), 
      0, 
      track.streamUrl, 
      track,
      queue
    );
  };

  return (
    <div className="bg-[#13151a] border border-neutral-800/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-full min-h-[400px]">
      <div className="p-4 border-b border-neutral-800/60 bg-neutral-900/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListMusic className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Up Next</h3>
        </div>
        <div className="flex items-center gap-2">
          {queue.length > 0 && canControl && (
            <button
              onClick={clearQueue}
              className="text-[10px] uppercase font-mono tracking-wider font-bold text-red-400 hover:text-red-300 px-2.5 py-0.5 rounded bg-red-950/20 border border-red-900/30 transition-all cursor-pointer hover:bg-red-950/40"
            >
              Clear
            </button>
          )}
          <span className="text-[10px] font-mono bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded">
            {queue.length} TRACKS
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
        {/* Currently Playing Section */}
        {currentTrack && (
          <div className="px-2">
            <h4 className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-2 pl-1">Now Playing</h4>
            <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center gap-3">
              <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-neutral-800">
                {currentTrack.thumbnail ? (
                  <img src={currentTrack.thumbnail} alt={currentTrack.title} className="w-full h-full object-cover" />
                ) : (
                  <Music className="w-full h-full p-3 text-neutral-600" />
                )}
                {room.isPlaying && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <Volume2 className="w-5 h-5 text-emerald-400 animate-pulse" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{currentTrack.title}</p>
                <p className="text-xs text-emerald-400 truncate">{currentTrack.artist}</p>
              </div>
            </div>
          </div>
        )}

        {/* Queue Items */}
        <div className="px-2 pb-4">
          <h4 className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-2 pl-1">Queue</h4>
          {queue.length === 0 ? (
            <div className="py-8 text-center border-2 border-dashed border-neutral-800/40 rounded-xl">
              <Music className="w-8 h-8 text-neutral-700 mx-auto mb-2" />
              <p className="text-xs text-neutral-500 font-mono">Queue is empty</p>
              <p className="text-[10px] text-neutral-600 mt-1">Add tracks from the library</p>
            </div>
          ) : (
            <Reorder.Group axis="y" values={queue} onReorder={handleReorder} className="space-y-1">
              {queue.map((track, index) => (
                <Reorder.Item
                  key={track.id || track.streamUrl}
                  value={track}
                  dragControls={controls}
                  dragListener={canControl}
                  className={`group p-2.5 hover:bg-neutral-800/40 border border-transparent hover:border-neutral-800 rounded-xl flex items-center gap-3 transition-all ${currentTrack?.id === track.id ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : ''}`}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <div className="cursor-grab text-neutral-600 hover:text-neutral-400 transition-colors">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <div className={`text-xs font-mono w-4 text-center ${currentTrack?.id === track.id ? 'text-emerald-400 font-bold' : 'text-neutral-500'}`}>
                    {index + 1}
                  </div>
                  <div className="relative w-10 h-10 rounded-md overflow-hidden shrink-0 bg-neutral-800">
                    {track.thumbnail ? (
                      <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <Music className="w-full h-full p-2.5 text-neutral-700" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-neutral-200 truncate group-hover:text-white">{track.title}</p>
                    <p className="text-[11px] text-neutral-500 truncate group-hover:text-neutral-400">{track.artist}</p>
                  </div>
                  
                  {canControl && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handlePlayNow(track)}
                        className="p-1.5 hover:bg-emerald-500/10 text-neutral-500 hover:text-emerald-400 rounded-lg transition-colors"
                        title="Play Now"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      
                      {isHost && (
                        <button
                          onClick={() => handleRemove(track)}
                          className="p-1.5 hover:bg-red-500/10 text-neutral-500 hover:text-red-400 rounded-lg transition-colors"
                          title="Remove from Queue"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </div>
      </div>
    </div>
  );
}
