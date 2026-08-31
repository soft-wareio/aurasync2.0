import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  VolumeX, 
  Volume2, 
  Music, 
  SkipBack,
  SkipForward
} from 'lucide-react';
import { RoomState } from '../types';
import library from '../assets/library.json';
import { syncEngine } from '../lib/syncEngine';
import SyncCorrector from './SyncCorrector';
import { Waveform } from './Waveform';

interface AudioPlayerProps {
  room: RoomState;
  deviceId: string;
  isHost: boolean;
  isSpatialAudioEnabled: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isBuffering: boolean;
  handleEnded: () => void;
  handleCanPlayThrough: () => void;
  handleWaiting: () => void;
  prebufferTimeLeft: number | null;
  currentTime: number;
  duration: number;
  volumeState: number;
  setVolumeState: (v: number) => void;
  audioReadyState: number;
  onTogglePlay: (isPlaying: boolean) => void;
  onSeek: (time: number) => void;
  isScrubbing: boolean;
  scrubTime: number;
  onScrubChange: (time: number) => void;
  onScrubCommit: () => void;
  localSeekActive: React.MutableRefObject<boolean>;
}

export default function AudioPlayer({ 
  room,
  deviceId,
  isHost,
  isSpatialAudioEnabled,
  audioRef,
  isBuffering,
  handleEnded,
  handleCanPlayThrough,
  handleWaiting,
  prebufferTimeLeft,
  currentTime,
  duration,
  volumeState,
  setVolumeState,
  audioReadyState,
  onTogglePlay,
  onSeek,
  isScrubbing,
  scrubTime,
  onScrubChange,
  onScrubCommit,
  localSeekActive
}: AudioPlayerProps) {
  const isPlaying = typeof room !== 'undefined' && room ? room.isPlaying : false;

  const isLogicalHost = isHost || (room && room.hostId === deviceId);
  const canControl = !room || room.playbackPermission === 'everyone' || isLogicalHost;

  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(80);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio Context Ref for Spatial Audio
  const audioContext = useRef<AudioContext | null>(null);
  const pannerNode = useRef<PannerNode | null>(null);
  const sourceNode = useRef<MediaElementAudioSourceNode | null>(null);

  // Setup Spatial Audio Context
  useEffect(() => {
    if (!isSpatialAudioEnabled || !audioRef.current) return;

    if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        sourceNode.current = audioContext.current.createMediaElementSource(audioRef.current);
        pannerNode.current = audioContext.current.createPanner();
        // Setup PannerNode with HRTF for "immersive" feel
        pannerNode.current.panningModel = 'HRTF';
        pannerNode.current.distanceModel = 'inverse';
        
        sourceNode.current.connect(pannerNode.current);
        pannerNode.current.connect(audioContext.current.destination);
    }
  }, [isSpatialAudioEnabled]);

  // Update Spatial Position based on Role
  useEffect(() => {
    if (!pannerNode.current || !room?.devices[deviceId]) return;
    
    const role = room.devices[deviceId].spatialRole;
    if (!role) return;

    // Mapping roles to 3D positions (x, y, z)
    // Left: (-1, 0, 0), Right: (1, 0, 0), Center: (0, 0, 1)
    // Vertical: Top is +y, Bottom is -y
    let pos = { x: 0, y: 0, z: 0 };
    switch(role) {
        case 'left': pos = { x: -1, y: 0, z: 0 }; break;
        case 'right': pos = { x: 1, y: 0, z: 0 }; break;
        case 'surround-left': pos = { x: -1.5, y: 0, z: -1 }; break;
        case 'surround-right': pos = { x: 1.5, y: 0, z: -1 }; break;
        case 'top-left': pos = { x: -1, y: 1, z: 0 }; break;
        case 'top-right': pos = { x: 1, y: 1, z: 0 }; break;
        case 'bottom-left': pos = { x: -1, y: -1, z: 0 }; break;
        case 'bottom-right': pos = { x: 1, y: -1, z: 0 }; break;
        case 'center': 
        default: pos = { x: 0, y: 0, z: 1 }; break;
    }
    
    // Smooth transition for spatial changes
    if (pannerNode.current.positionX.setTargetAtTime) {
        pannerNode.current.positionX.setTargetAtTime(pos.x, audioContext.current.currentTime, 0.1);
        pannerNode.current.positionY.setTargetAtTime(pos.y, audioContext.current.currentTime, 0.1);
        pannerNode.current.positionZ.setTargetAtTime(pos.z, audioContext.current.currentTime, 0.1);
    } else {
        pannerNode.current.positionX.value = pos.x;
        pannerNode.current.positionY.value = pos.y;
        pannerNode.current.positionZ.value = pos.z;
    }
    
  }, [room?.devices[deviceId]?.spatialRole, isSpatialAudioEnabled]);

  const [isYTReady, setIsYTReady] = useState(false);
  const ytPlayerRef = useRef<any>(null);

  // Theme generator array
  const bgImages = [
    "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?q=80&w=800&auto=format&fit=crop", // Galaxy
    "https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?q=80&w=800&auto=format&fit=crop", // Starry Night
    "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?q=80&w=800&auto=format&fit=crop", // Mountain Night
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800&auto=format&fit=crop", // Earth
    "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop", // Aurora
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=800&auto=format&fit=crop", // Starry Sky
    "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=800&auto=format&fit=crop",  // Neon
    "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?q=80&w=800&auto=format&fit=crop" // Deep Space
  ];
  const [themeBg, setThemeBg] = useState<string>(bgImages[0]);

  useEffect(() => {
    // Pick a new random theme when the track ID changes
    setThemeBg(bgImages[Math.floor(Math.random() * bgImages.length)]);
  }, [room?.currentTrack?.id]);

  // Helper to extract Youtube videoId
  const getYoutubeVideoId = (track: any) => {
    if (!track) return null;
    if (track.id && track.id.startsWith("yt_")) {
      return track.id.replace("yt_", "");
    }
    if (track.streamUrl && (track.streamUrl.includes("id=") || track.streamUrl.includes("/api/stream?id="))) {
      const match = track.streamUrl.match(/id=([^&]+)/);
      if (match) return match[1];
    }
    return null;
  };

  useEffect(() => {
    // Inject YouTube Iframe API if not loaded
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  useEffect(() => {
    let interval: any;
    const initPlayer = () => {
      if ((window as any).YT && (window as any).YT.Player) {
        clearInterval(interval);
        ytPlayerRef.current = new (window as any).YT.Player('youtube-player', {
          height: '0',
          width: '0',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            mute: 0,
            origin: window.location.origin
          },
          events: {
            onReady: () => {
              console.log("[YT Player] Ready!");
              setIsYTReady(true);
              (window as any).activeYtPlayer = ytPlayerRef.current;
            },
            onStateChange: (event: any) => {
              if (event.data === (window as any).YT.PlayerState.ENDED) {
                handleEnded();
              }
            },
            onError: (e: any) => {
              console.error("[YT Player] Error:", e.data);
            }
          }
        });
        (window as any).activeYtPlayer = ytPlayerRef.current;
      }
    };

    if ((window as any).YT && (window as any).YT.Player) {
      initPlayer();
    } else {
      interval = setInterval(initPlayer, 500);
    }

    return () => {
      clearInterval(interval);
      if (ytPlayerRef.current && ytPlayerRef.current.destroy) {
        try { ytPlayerRef.current.destroy(); } catch (e) {}
      }
    };
  }, []);

  const handleMuteToggle = () => {
    if (isMuted) {
      setVolumeState(prevVolume || 80);
      setIsMuted(false);
      const isYoutube = !!getYoutubeVideoId(room?.currentTrack);
      if (isYoutube) {
        if (ytPlayerRef.current && isYTReady) {
          try { ytPlayerRef.current.setVolume(prevVolume || 80); } catch (e) {}
        }
      } else {
        if (audioRef.current) {
          audioRef.current.muted = false;
          audioRef.current.volume = (prevVolume || 80) / 100;
        }
      }
    } else {
      setPrevVolume(volumeState);
      setVolumeState(0);
      setIsMuted(true);
      const isYoutube = !!getYoutubeVideoId(room?.currentTrack);
      if (isYoutube) {
        if (ytPlayerRef.current && isYTReady) {
          try { ytPlayerRef.current.setVolume(0); } catch (e) {}
        }
      } else {
        if (audioRef.current) {
          audioRef.current.muted = true;
          audioRef.current.volume = 0;
        }
      }
    }
  };

  // Sync Engine V2: React to room state change
  useEffect(() => {
    if (typeof room === 'undefined' || !room || localSeekActive.current) return;

    const ytId = getYoutubeVideoId(room.currentTrack);
    const isYoutube = !!ytId;

    if (isYoutube) {
      // --- YOUTUBE AUDIO SYNCHRONIZER MOUNT/SYNC ---
      // 1. Silent HTML5 audio element
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.removeAttribute('src'); 
        } catch (e) {}
      }

      if (ytPlayerRef.current && isYTReady) {
        try {
          (window as any).activeYtPlayer = ytPlayerRef.current;

          // Compute target seconds based on absolute elapsed time if playing
          const currentSyncTime = syncEngine.getSynchronizedTime();
          let targetSecs = room.isPlaying
            ? (currentSyncTime - (room.startTime || currentSyncTime)) / 1000
            : (room.pauseOffset || 0) / 1000;

          if (targetSecs < 0) targetSecs = 0;
          const trackDuration = room.currentTrack?.duration || 0;
          if (trackDuration > 0 && targetSecs > trackDuration) {
            targetSecs = trackDuration;
          }

          // 2. Load the track if not already cued/loaded
          const currentVideoUrl = ytPlayerRef.current.getVideoUrl?.() || "";
          if (!currentVideoUrl.includes(ytId)) {
            ytPlayerRef.current.cueVideoById({
              videoId: ytId,
              startSeconds: targetSecs
            });
          }

          // 3. Play/Pause state tracking
          if (room.isPlaying) {
            ytPlayerRef.current.playVideo();
          } else {
            ytPlayerRef.current.pauseVideo();
          }

          // 4. Seek state tracking
          const currentYTSecs = ytPlayerRef.current.getCurrentTime() || 0;
          const diff = Math.abs(currentYTSecs - targetSecs);
          // For host, only seek on massive misalignment. For guests, auto-sync and maintain ultra tight sub-second alignment.
          if (!isHost ? (diff > 0.45) : (diff > 4.5)) {
            ytPlayerRef.current.seekTo(targetSecs, true);
          }

          // 5. Volume application
          ytPlayerRef.current.setVolume(isMuted ? 0 : volumeState);
        } catch (err) {
          console.warn("[YT Player] sync error:", err);
        }
      }
    } else {
      // --- HTML5 NATIVE AUDIO SYNCHRONIZER MOUNT/SYNC ---
      // Stop YouTube player
      if (ytPlayerRef.current && isYTReady) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch (e) {}
      }

      if (!audioRef.current) return;

      // Compute target seconds based on absolute elapsed time if playing
      const currentSyncTime = syncEngine.getSynchronizedTime();
      let targetSecs = room.isPlaying
        ? (currentSyncTime - (room.startTime || currentSyncTime)) / 1000
        : (room.pauseOffset || 0) / 1000;

      if (targetSecs < 0) targetSecs = 0;
      const trackDuration = room.currentTrack?.duration || 0;
      if (trackDuration > 0 && targetSecs > trackDuration) {
        targetSecs = trackDuration;
      }

      setErrorMessage(null);

      // Resolve stream
      const resolveStream = async () => {
        let expectedSrc = "";
        if (room.currentTrack?.streamUrl) {
          expectedSrc = room.currentTrack.streamUrl;
        } else if (room.audioSource && room.audioSource.startsWith("http")) {
          expectedSrc = room.audioSource;
        } else if (room.currentTrack?.id) {
          const track = library.find((t: any) => t.id === room.currentTrack?.id);
          if (track) {
            expectedSrc = track.url;
          } else {
            setErrorMessage("Song not available");
            return;
          }
        }

        if (expectedSrc) {
          const currentAbsolute = audioRef.current.src;
          const expectedAbsolute = expectedSrc.startsWith('http://') || expectedSrc.startsWith('https://')
            ? expectedSrc
            : new URL(expectedSrc, window.location.origin).href;
          if (currentAbsolute !== expectedAbsolute) {
            audioRef.current.src = expectedSrc;
            audioRef.current.load();
          }
        }
      };

      resolveStream();

      // Sync play/pause and seek
      if (room.isPlaying) {
        // Sync seek time for guest
        if (!isHost) {
          const diff = Math.abs(audioRef.current.currentTime - targetSecs);
          if (diff > 0.1) {
            try {
              if (audioRef.current.readyState >= 1) {
                audioRef.current.currentTime = targetSecs;
              }
            } catch (e) {}
          }
        }

        if (audioRef.current.paused) {
          audioRef.current.play()
            .then(() => { console.log("Playback started successfully on mobile device."); })
            .catch((error) => { 
               console.error("Playback failed, attempting asset reload: ", error);
               audioRef.current!.load();
               setTimeout(() => { audioRef.current!.play().catch(e => console.log("Final playback fallback blocked:", e)); }, 300);
            });
        }
      } else {
        if (!audioRef.current.paused) {
          audioRef.current.pause();
        }
        // Force seek on pause for guest
        if (!isHost) {
          const diff = Math.abs(audioRef.current.currentTime - targetSecs);
          if (diff > 0.15) {
            try {
              if (audioRef.current.readyState >= 1) {
                audioRef.current.currentTime = targetSecs;
              }
            } catch (e) {}
          }
        }
      }
    }
  }, [room?.isPlaying, room?.currentTrack?.id, isYTReady, volumeState, isMuted, room?.pauseOffset, room?.startTime, isHost]);

  // Listen to manual calibration triggers to instantly force-align playheads perfectly with 0 drift on-demand
  useEffect(() => {
    const handleCalibrationTriggered = () => {
      if (!room) return;
      if (!audioRef.current) return;

      const currentSyncTime = syncEngine.getSynchronizedTime();
      let targetSecs = room.isPlaying
        ? (currentSyncTime - (room.startTime || currentSyncTime)) / 1000
        : (room.pauseOffset || 0) / 1000;

      if (targetSecs < 0) targetSecs = 0;
      const trackDuration = room.currentTrack?.duration || 0;
      if (trackDuration > 0 && targetSecs > trackDuration) {
        targetSecs = trackDuration;
      }

      console.log(`[Manual Perfect Sync] Force aligning playhead to ${targetSecs}s from the beginning of trigger`);
      
      const isYoutube = !!(room.currentTrack?.id?.startsWith("yt_") || 
                        (room.currentTrack?.streamUrl && (room.currentTrack.streamUrl.includes("id=") || room.currentTrack.streamUrl.includes("/api/stream?id="))));

      if (isYoutube) {
        if (ytPlayerRef.current && isYTReady) {
          try {
            ytPlayerRef.current.seekTo(targetSecs, true);
            if (room.isPlaying) ytPlayerRef.current.playVideo();
          } catch (e) {}
        }
      } else {
        try {
          if (audioRef.current.readyState >= 1) {
            audioRef.current.currentTime = targetSecs;
          }
          if (room.isPlaying && audioRef.current.paused) {
            audioRef.current.play().catch(() => {});
          }
        } catch (e) {}
      }

      // Fire confirmation success event back to SyncCorrector component
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('aura-calibration-success', {
          detail: { drift: 0, newOffset: syncEngine.getSynchronizedTime() - Date.now() }
        }));
      }, 400);
    };

    window.addEventListener('request-aura-calibration', handleCalibrationTriggered);
    return () => {
      window.removeEventListener('request-aura-calibration', handleCalibrationTriggered);
    };
  }, [room, isYTReady]);

  // Media Session API for mobile lock screens, notification controllers, and task backgrounding
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator) || !room?.currentTrack) return;

    const track = room.currentTrack;

    try {
      // Set Metadata for the notification display
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Local Test Track',
        artist: track.artist || 'AuraSync Local',
        album: 'AuraSync Live Session',
        artwork: [
          { 
            src: track.thumbnail || 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?q=80&w=512&auto=format&fit=crop', 
            sizes: '512x512', 
            type: 'image/png' 
          },
          { 
            src: track.thumbnail || 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?q=80&w=256&auto=format&fit=crop', 
            sizes: '256x256', 
            type: 'image/png' 
          }
        ]
      });

      // Synchronize player action state (playing / paused)
      navigator.mediaSession.playbackState = room.isPlaying ? 'playing' : 'paused';

      // Connect notification click actions to room actions
      navigator.mediaSession.setActionHandler('play', () => {
        onTogglePlay(true);
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        onTogglePlay(false);
      });

      // Seek backward/forward lock-screen buttons
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const offset = details.seekOffset || 10;
        if (isHost) onSeek(Math.max(0, currentTime - offset));
      });

      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const offset = details.seekOffset || 10;
        if (isHost) onSeek(Math.min(duration, currentTime + offset));
      });

      // Lock-screen exact progress scrubbing timeline handler
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && isHost) {
          onSeek(details.seekTime);
        }
      });
    } catch (error) {
      console.warn("MediaSession layout exception:", error);
    }
  }, [room?.currentTrack?.id, room?.isPlaying, duration, currentTime, isHost, onTogglePlay, onSeek]);

  // Synchronize precise time timeline bar inside notification trays
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator) || !room?.currentTrack) return;

    if (duration > 0 && isFinite(duration) && currentTime >= 0 && isFinite(currentTime)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: duration,
          playbackRate: 1.0,
          position: Math.min(currentTime, duration)
        });
      } catch (err) {
        console.warn("Failed syncing timeline position onto MediaSession:", err);
      }
    }
  }, [currentTime, duration, room?.currentTrack]);

  const handleTogglePlay = () => {
    if (typeof room !== 'undefined' && room && canControl) {
        onTogglePlay(!room.isPlaying);
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canControl) return;
    const newTime = parseFloat(e.target.value);
    onScrubChange(newTime);
  };

  const handleSkipBack = () => {
    if (canControl) {
      onSeek(0);
    }
  };

  const handleSkipForward = () => {
    // Disabled track changing as per "STATIC SRC ONLY"
  };

  return (
    <div className="relative rounded-2xl shadow-2xl shadow-emerald-500/5 transition-all duration-700 border border-white/10 z-20">
      
      {/* Background container with rounded corners and overflow hidden to avoid edge clipping */}
      <div className="absolute inset-0 z-0 rounded-2xl overflow-hidden pointer-events-none">
        {/* Dynamic Background Image */}
        <div 
          className="absolute inset-0 transition-opacity duration-1000 ease-in-out"
          style={{
            backgroundImage: `url('${themeBg}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.5
          }}
        />
        {/* Dark overlay to ensure readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-black/60 to-black/80 backdrop-blur-[2px]" />
      </div>

      <div className="relative z-10 p-6 space-y-6">
        {/* Hidden container for YouTube Player API */}
        <div id="youtube-player-container" className="text-transparent absolute pointer-events-none opacity-0 w-[1px] h-[1px] overflow-hidden">
          <div id="youtube-player"></div>
        </div>

        {/* Track Information */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div className="flex items-center space-x-5">
          <div className="relative group">
            <div className={`p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center transition-all duration-500 group-hover:scale-105 ${isPlaying ? 'text-emerald-400 border-emerald-500/30' : 'text-neutral-500'}`}>
              <Music className={`w-8 h-8 ${isPlaying ? 'animate-pulse' : ''}`} />
            </div>
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#10b981] font-bold flex items-center gap-2 mb-1">
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${isPlaying ? 'animate-ping' : ''}`}></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
              </span>
              Source: {getYoutubeVideoId(room?.currentTrack) ? 'Official YouTube Source' : 'Direct Cloud'}
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight leading-tight mb-0.5">
              {errorMessage ? errorMessage : (room?.currentTrack?.title || 'Local Test Track')}
            </h2>
            <p className="text-sm font-medium text-neutral-400/80">
              {room?.currentTrack?.artist || 'AuraSync Local'}
            </p>
          </div>
        </div>

        {/* Sync Calibration Control */}
        <div className="flex items-center gap-2 self-start md:self-center">
          <SyncCorrector />
        </div>
      </div>

      {/* Sync Control Playback Progress Slider - Snake/Wave Style */}
      <div className="space-y-3 px-1">
        <div className="flex justify-between text-[11px] text-neutral-400 font-mono font-medium">
          <span className="bg-white/5 px-2 py-0.5 rounded-md">{formatTime(Math.min(isScrubbing ? scrubTime : currentTime, duration))}</span>
          <span className="bg-white/5 px-2 py-0.5 rounded-md">{formatTime(duration)}</span>
        </div>
        <div className="group relative pt-4 pb-4">
          <input 
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={isScrubbing ? scrubTime : currentTime}
            disabled={!canControl}
            onChange={handleScrub}
            onPointerUp={onScrubCommit}
            onMouseUp={onScrubCommit}
            onTouchEnd={onScrubCommit}
            onPointerLeave={(e) => { 
                if (e.buttons > 0) onScrubCommit(); 
            }}
            onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') onScrubCommit();
            }}
            className={`absolute top-0 left-0 w-full h-full opacity-0 z-20 ${canControl ? 'cursor-pointer' : 'cursor-not-allowed'}`}
          />
          <div className={`relative w-full h-8 flex items-center transition-all group-hover:h-10 ${!canControl ? 'opacity-55' : ''}`}>
            <Waveform progressPercent={(duration > 0 && isFinite(duration)) ? (Math.min(isScrubbing ? scrubTime : currentTime, duration) / duration) * 100 : 0} />
          </div>
        </div>
      </div>

      {/* Compact Playback Trigger Buttons */}
      <div className="flex flex-col items-center justify-center pt-2">
        <div className="flex items-center gap-3 bg-black/40 px-6 py-3 rounded-full border border-white/10 shadow-lg backdrop-blur-md">
          {/* Skip Back */}
          <button
            onClick={handleSkipBack}
            className={`p-2 rounded-full text-neutral-400 hover:text-white transition-all active:scale-90 ${canControl ? 'cursor-pointer hover:bg-white/10' : 'cursor-not-allowed opacity-50'}`}
            title={canControl ? "Restart" : "Playback control restricted"}
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>

          {/* Small Play/Pause */}
          <button
            onClick={handleTogglePlay}
            className={`w-10 h-10 mx-2 rounded-full flex items-center justify-center transition-all bg-emerald-500 text-black hover:bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)] shrink-0 ${canControl ? 'cursor-pointer hover:scale-[1.15] active:scale-95' : 'cursor-not-allowed opacity-50'}`}
            title={canControl ? "Local Play/Pause" : "Playback control restricted"}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 stroke-[3] fill-black" />
            ) : (
              <Play className="w-4 h-4 stroke-[3] fill-black ml-0.5" />
            )}
          </button>

          {/* Skip Forward */}
          <button
            onClick={handleSkipForward}
            className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-all active:scale-90 cursor-not-allowed opacity-50"
            title="Next Track (Disabled in Local Test)"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>

          <div className="w-[1px] h-6 bg-white/10 mx-2" />

          {/* Compact Volume Control */}
          <div className="flex items-center gap-2 group">
            <button 
              onClick={handleMuteToggle} 
              className="text-neutral-400 hover:text-emerald-400 transition-colors cursor-pointer p-1"
            >
              {isMuted || volumeState === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={isMuted ? 0 : volumeState}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setVolumeState(v);
                setIsMuted(false);
                if (audioRef.current) {
                  audioRef.current.volume = v / 100;
                  audioRef.current.muted = false; // Absolute Mute Bypass
                }
              }}
              className="w-16 h-1 w-0 md:w-16 accent-emerald-500 bg-white/10 rounded-full cursor-pointer appearance-none transition-all duration-300 md:opacity-100 opacity-50 group-hover:opacity-100"
            />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function formatTime(secs: number): string {
  if (isNaN(secs) || !isFinite(secs) || secs <= 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
