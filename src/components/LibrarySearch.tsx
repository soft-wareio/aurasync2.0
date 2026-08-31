import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Play, Music } from 'lucide-react';

import { TrackMeta } from '../types';
import { searchMusic, TrackResult } from '../lib/musicSearch';

interface LibrarySearchProps {
  onSelectTrack: (track: TrackMeta) => void;
  onQueueTrack: (track: TrackMeta) => void;
  isHost: boolean;
  playbackPermission?: 'everyone' | 'admins';
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "3:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  const formattedSecs = secs === 60 ? '00' : (secs < 10 ? `0${secs}` : secs);
  const formattedMins = secs === 60 ? mins + 1 : mins;
  return `${formattedMins}:${formattedSecs}`;
}

export default function LibrarySearch({ onSelectTrack, onQueueTrack, isHost, playbackPermission }: LibrarySearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TrackResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [properSongsOnly, setProperSongsOnly] = useState(true);
  const [addedTrackId, setAddedTrackId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const canControl = isHost || playbackPermission === 'everyone';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setIsLoading(true);
      setError('');
      try {
        const data = await searchMusic(query, properSongsOnly);
        setResults(data);
        if (data.length > 0) {
          setIsOpen(true);
        }
      } catch (err) {
        console.error(err);
        setError('Search Failed: Try another track');
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => clearTimeout(delayDebounceFn);
  }, [query, properSongsOnly]);



  return (
    <div ref={searchRef} className="w-full max-w-2xl mx-auto mt-8 flex flex-col gap-3">
      {/* Search Input Control */}
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-400 group-focus-within:text-emerald-400 transition-colors">
          <Search size={18} />
        </div>
        <input
          type="text"
          value={query}
          onFocus={() => { if (results.length > 0) setIsOpen(true) }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          placeholder="Search music library..."
          className="w-full bg-[#13151a] backdrop-blur-md border border-neutral-800 focus:border-emerald-500/50 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-neutral-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all font-sans"
        />
        {isLoading && (
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}
      </div>

      <div className="text-[11px] text-[#8e9aa8] font-medium px-2 -mt-1 flex items-center gap-1.5 select-none">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/50 animate-pulse"></span>
        <span>Prefer to use for English songs: <span className="text-emerald-400 font-bold">Official YouTube Source</span></span>
      </div>

      <div className="flex items-center justify-between px-1">
        <button
          onClick={() => setProperSongsOnly(!properSongsOnly)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
            properSongsOnly 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
              : 'bg-neutral-800/40 text-neutral-400 border-neutral-800 hover:bg-neutral-800/60'
          }`}
          title="Filters out remixes, instrumentals, and background noise to show only proper vocal songs."
        >
          <span className={`w-1.5 h-1.5 rounded-full ${properSongsOnly ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
          {properSongsOnly ? "Filter Active: Proper Vocal Songs Only" : "Show All (Remixes, Tunes & Sounds)"}
        </button>
        <span className="text-[10px] text-neutral-500 font-mono tracking-wider">
          Vocal Protection Active
        </span>
      </div>

      {error && (
        <div className="text-red-400 text-xs px-4 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {/* Search Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="bg-[#13151a] backdrop-blur-xl border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl p-2 flex flex-col gap-1 max-h-[400px] overflow-y-auto custom-scrollbar">
          {results.map((track, index) => (
            <div
              key={`${track.id}-${index}`}
              onClick={() => {
                if (!canControl) {
                  alert("Playback is restricted to Admins by the host.");
                  return;
                }
                if (!track.streamUrl || track.streamUrl.includes('undefined')) {
                  setError("Track Unavailable");
                  return;
                }
                onSelectTrack({
                  id: track.id,
                  title: track.title,
                  artist: track.artist,
                  thumbnail: track.thumbnail,
                  duration: track.duration,
                  streamUrl: track.streamUrl
                });
                setIsOpen(false);
              }}
              role="button"
              tabIndex={0}
              className={`w-full flex items-center gap-4 p-2.5 hover:bg-neutral-800/60 rounded-xl transition-all text-left group transition-opacity ${!canControl ? 'cursor-not-allowed opacity-50' : 'cursor-pointer active:scale-95'}`}
            >
              <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-neutral-800 flex items-center justify-center">
                {track.thumbnail ? (
                  <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <Music size={18} className="text-neutral-500" />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play size={16} className="text-white fill-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-white truncate">{track.title}</h4>
                  <span className={`shrink-0 text-[8px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border leading-none ${
                    (track.id && String(track.id).startsWith("yt_")) || (track.streamUrl && (track.streamUrl.includes("id=") || track.streamUrl.includes("/api/stream?id=")))
                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {(track.id && String(track.id).startsWith("yt_")) || (track.streamUrl && (track.streamUrl.includes("id=") || track.streamUrl.includes("/api/stream?id=")))
                      ? 'YouTube Official'
                      : 'Direct Cloud'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-400">
                  <span className="truncate max-w-[80%]">{track.artist}</span>
                  {track.duration && (
                    <>
                      <span className="shrink-0 text-neutral-600 font-mono">•</span>
                      <span className="shrink-0 font-mono text-[10px] text-neutral-500">{formatDuration(track.duration)}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canControl) return;
                  if (!track.streamUrl || track.streamUrl.includes('undefined')) {
                    setError("Track Unavailable");
                    return;
                  }
                  onQueueTrack({
                    id: track.id,
                    title: track.title,
                    artist: track.artist,
                    thumbnail: track.thumbnail,
                    duration: track.duration,
                    streamUrl: track.streamUrl
                  });

                  // Trigger feedback
                  setAddedTrackId(track.id);
                  setTimeout(() => setAddedTrackId(null), 2000);
                }}
                disabled={!canControl || addedTrackId === track.id}
                className={`ml-auto text-[10px] font-mono px-2 py-1.5 rounded-lg border border-transparent transition-all ${
                  canControl 
                    ? 'text-neutral-400 hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/20' 
                    : 'text-neutral-600 cursor-not-allowed'
                }`}
              >
                {addedTrackId === track.id ? 'ADDED' : '+ QUEUE'}
              </button>
            </div>
          ))}
        </div>
      )}
      
      {isOpen && !isLoading && query && results.length === 0 && !error && (
        <div className="text-center py-8 text-neutral-500 text-sm font-mono">
          No tracks found for "{query}"
        </div>
      )}


    </div>
  );
}
