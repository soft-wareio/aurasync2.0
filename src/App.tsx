import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import RoomJoiner from './components/RoomJoiner';
import AudioPlayer from './components/AudioPlayer';
import AudioErrorBoundary from './components/AudioErrorBoundary';
import SpatialGrid from './components/SpatialGrid';
import MemberPresence from './components/MemberPresence';
import LibrarySearch from './components/LibrarySearch';
import BottomPlayer from './components/BottomPlayer';
import ChatBox from './components/ChatBox';
import QueueList from './components/QueueList';
import RoomManagement from './components/RoomManagement';
import SyncCorrector from './components/SyncCorrector';
import StatsOverlay from './components/StatsOverlay';
import { useAudioSync } from './hooks/useAudioSync';
import { diagnosticsState } from './lib/diagnostics';
import { AudioQueueProvider } from './context/AudioContext';
import { syncEngine } from './lib/syncEngine';
import { 
  createRoom, 
  joinRoom, 
  updateDeviceState,
  updateRoomPlayerState,
  joinRoomPresence,
  leaveRoomPresence,
  addTrackToQueue,
  p2pRoomManager
} from './lib/p2p';
import { RoomState, TrackMeta } from './types';

export default function App() {
  const [roomCode, setRoomCode] = useState<string>('');
  const [deviceId, setDeviceId] = useState<string>('');
  const [deviceName, setDeviceName] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [joinStartTime, setJoinStartTime] = useState<number | null>(null);

  const [isSpatialAudioEnabled, setIsSpatialAudioEnabled] = useState<boolean>(false);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);

  const [volumeState, setVolumeState] = useState<number>(80);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [audioReadyState, setAudioReadyState] = useState<number>(0);

  // Single Source of Truth for Playback Engine
  const { 
    room: currentRoom, 
    audioRef, 
    isBuffering, 
    prebufferTimeLeft,
    handleEnded, 
    handleCanPlayThrough, 
    handleWaiting
  } = useAudioSync(roomCode, deviceId, isHost, volumeState);

  // Generate or retrieve persistent local device ID from session storage to prevent duplicates
  useEffect(() => {
    let cachedId = sessionStorage.getItem('user_session_id');
    if (!cachedId) {
      cachedId = 'dev_' + Math.random().toString(36).substring(2, 11);
      sessionStorage.setItem('user_session_id', cachedId);
    }
    setDeviceId(cachedId);

    // Deep-link check for shared room link (e.g. ?room=123456)
    const params = new URLSearchParams(window.location.search);
    const sharedRoom = params.get('room');
    if (sharedRoom && sharedRoom.length === 6) {
      setRoomCode(sharedRoom);
    }
  }, []);

  // Heartbeat interval to renew device alive state
  useEffect(() => {
    if (!roomCode) return;

    const heartbeat = setInterval(() => {
      updateDeviceState(roomCode, deviceId, { lastActive: Date.now() });
    }, 15000);

    return () => {
      clearInterval(heartbeat);
    };
  }, [roomCode, deviceId]);

  // Synchronize dynamic host privileges in real-time
  useEffect(() => {
    if (currentRoom) {
      const actualHost = (currentRoom.hostId === deviceId) || p2pRoomManager.isHost;
      if (actualHost !== isHost) {
        console.log(`[Host Handover] Active UI state updated: isHost -> ${actualHost}`);
        setIsHost(actualHost);
      }
    } else {
      setIsHost(false);
    }
  }, [currentRoom?.hostId, deviceId, isHost]);

  const handleRoomJoinOrCreate = async (code: string, chosenName: string, hostFlag: boolean) => {
    setIsLoading(true);
    setErrorMsg(null);
    setDeviceName(chosenName);
    setIsHost(hostFlag);
    setJoinStartTime(performance.now());

    // Set sample audio source URL or standard placeholder soundtrack (high-quality royalty free synthwave)
    const audioSource = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

    try {
      if (hostFlag) {
        await createRoom(code, deviceId, chosenName, audioSource);
      } else {
        await joinRoom(code, deviceId, chosenName, false);
      }

      setRoomCode(code);

      const userId = deviceId;
      joinRoomPresence(code, userId, chosenName);

      // Reflect current room in the URL without page reload
      const newUrl = `${window.location.origin}${window.location.pathname}?room=${code}`;
      window.history.pushState({ path: newUrl }, '', newUrl);

    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed connecting to synchronizer room.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveRoom = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if (roomCode) {
      const userId = deviceId;
      leaveRoomPresence(roomCode, userId);
    }
    setRoomCode('');
    // Clear URL parameters
    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.pushState({ path: cleanUrl }, '', cleanUrl);
  };

  const handleTogglePlay = (isPlaying: boolean) => {
    if (!currentRoom) return;
    const currentSyncTime = syncEngine.getSynchronizedTime();
    let newPauseOffset = currentRoom.pauseOffset || 0;
    let newStartTime = currentRoom.startTime || Date.now();
    
    if (!isPlaying) {
      // Pausing: calculate where we stopped
      newPauseOffset = Math.max(0, currentTime * 1000);
    } else {
      // Playing: we resume from pause point
      const resumePoint = currentRoom.pauseOffset || 0;
      newStartTime = currentSyncTime - resumePoint;
    }

    updateRoomPlayerState(currentRoom.code, isPlaying, newStartTime, newPauseOffset);
  };

  const handleSeek = (time: number) => {
    if (!currentRoom) return;
    const currentSyncTime = syncEngine.getSynchronizedTime();
    const newPauseOffset = time * 1000;
    const newStartTime = currentSyncTime - newPauseOffset;

    // Immediately seek local audio representation to avoid lag and glitching
    if (audioRef.current && !audioRef.current.tagName.includes("iframe")) {
      try {
        audioRef.current.currentTime = time;
      } catch (e) {}
    }
    // Immediately seek local YouTube if active
    const yt = (window as any).activeYtPlayer;
    if (yt && typeof yt.seekTo === 'function') {
      try {
        yt.seekTo(time, true);
      } catch (e) {}
    }

    updateRoomPlayerState(currentRoom.code, currentRoom.isPlaying, newStartTime, newPauseOffset);
  };

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const lastScrubTimeRef = useRef(0);
  const localSeekActive = useRef(false);

  const handleScrubChange = (time: number) => {
    setIsScrubbing(true);
    setScrubTime(time);
  };

  const handleScrubCommit = () => {
    if (!isScrubbing) return;
    if (audioRef.current && !audioRef.current.tagName.includes("iframe")) {
      audioRef.current.currentTime = scrubTime;
    }
    // Set global p2p scrub time
    p2pRoomManager.lastScrubTime = Date.now();
    lastScrubTimeRef.current = Date.now();
    localSeekActive.current = true;
    setTimeout(() => { localSeekActive.current = false; }, 2000);
    setIsScrubbing(false);
    handleSeek(scrubTime);
  };

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

  const handleSelectTrack = async (track: TrackMeta) => {
    if (!currentRoom) return;

    // Direct synchronous user interaction unblock: load and prep HTML5 player during click events to satisfy mobile
    if (audioRef.current && track.streamUrl) {
      audioRef.current.src = track.streamUrl;
      audioRef.current.load();
      audioRef.current.play().then(() => {
        audioRef.current?.pause();
      }).catch(err => {
        console.warn("[App] Track selection audio prepare error:", err);
      });
    }

    // Direct synchronous cueing on active YouTube Player if it's a YouTube track
    const ytId = getYoutubeVideoId(track);
    const yt = (window as any).activeYtPlayer;
    if (ytId && yt && typeof yt.cueVideoById === 'function') {
      try {
        yt.cueVideoById({ videoId: ytId });
      } catch (e) {}
    }

    try {
      // Soft-Loading: Just update the audio source for manual play
      await updateRoomPlayerState(currentRoom.code, false, currentRoom.startTime || Date.now(), 0, track.streamUrl, track);
    } catch (error) {
      console.error("Failed to select track:", error);
    }
  };

  const handleQueueTrack = (track: TrackMeta) => {
    if (!currentRoom) return;
    addTrackToQueue(currentRoom.code, track);
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (roomCode) {
        const userId = deviceId;
        leaveRoomPresence(roomCode, userId);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [roomCode, deviceId]);

  useEffect(() => {
    if (currentRoom && joinStartTime !== null) {
      diagnosticsState.runSyncTest(currentRoom.code, deviceId, joinStartTime);
      setJoinStartTime(null);
    }
  }, [currentRoom, joinStartTime, deviceId]);

  const isPlayingState = currentRoom?.isPlaying || false;

  // Dual-Engine Polling Tracker: Sync time for active YouTube tracks
  useEffect(() => {
    let timer: any;
    const track = currentRoom?.currentTrack;
    const isYoutube = track?.id?.startsWith("yt_") || (track?.streamUrl && (track.streamUrl.includes("id=") || track.streamUrl.includes("/api/stream?id=")));

    if (isYoutube) {
      timer = setInterval(() => {
        const yt = (window as any).activeYtPlayer;
        if (yt && typeof yt.getCurrentTime === 'function' && typeof yt.getDuration === 'function') {
          try {
            const ytTime = yt.getCurrentTime();
            const ytDuration = yt.getDuration() || track?.duration || 0;
            if (typeof ytTime === 'number' && !isNaN(ytTime)) {
              if (!isScrubbing) {
                setCurrentTime(ytTime);
              }
            }
            if (typeof ytDuration === 'number' && !isNaN(ytDuration) && ytDuration > 0) {
              setDuration(ytDuration);
            }
          } catch (e) {}
        }
      }, 250);
    }

    return () => clearInterval(timer);
  }, [currentRoom?.currentTrack?.id, isPlayingState, isScrubbing]);

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget;
    const clampedDuration = (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) ? audio.duration : (currentRoom?.currentTrack?.duration || 0);
    const clampedTime = Math.min(audio.currentTime, clampedDuration);
    if (!isScrubbing) {
      setCurrentTime(clampedTime);
    }
    setDuration(clampedDuration);
    setAudioReadyState(audio.readyState);
  };

  const handleAudioEnded = async () => {
    if (!isHost || !currentRoom) return;
    if (currentRoom.queue && currentRoom.queue.length > 0) {
      let nextIndex = 0;
      if (currentRoom.currentTrack) {
        nextIndex = currentRoom.queue.findIndex(t => t.id === currentRoom.currentTrack?.id) + 1;
      }
      
      if (nextIndex >= 0 && nextIndex < currentRoom.queue.length) {
        const nextTrack = currentRoom.queue[nextIndex];
        
        await updateRoomPlayerState(
          currentRoom.code,
          true,
          syncEngine.getSynchronizedTime(),
          0,
          nextTrack.streamUrl,
          nextTrack,
          currentRoom.queue
        );
      } else {
        await updateRoomPlayerState(
          currentRoom.code,
          false,
          syncEngine.getSynchronizedTime(),
          0
        );
      }
    } else {
      await updateRoomPlayerState(
        currentRoom.code,
        false,
        syncEngine.getSynchronizedTime(),
        0
      );
    }
  };

  return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="min-h-screen bg-[#0d0e12] font-sans antialiased text-neutral-200 selection:bg-neutral-800"
      >
        {!currentRoom ? (
        <RoomJoiner
          onJoin={handleRoomJoinOrCreate}
          isLoading={isLoading}
          errorMsg={errorMsg}
        />
      ) : (
        <AudioQueueProvider room={currentRoom} isHost={isHost}>
          <div className="flex flex-col items-center justify-start p-4 md:p-8 min-h-screen w-full max-w-7xl mx-auto space-y-6">
          {/* Single Shared Global Audio Instance */}
          <audio
            ref={audioRef}
            preload="auto"
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleTimeUpdate}
            onLoadedMetadata={handleTimeUpdate}
            onLoadedData={handleTimeUpdate}
            onCanPlay={handleTimeUpdate}
            onEnded={handleAudioEnded}
          />
          {/* Header Bar */}
          <div className="w-full bg-[#13151a] border border-neutral-800/80 rounded-2xl p-6 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase font-mono tracking-widest text-[#10b981] font-bold">Room Active</span>
              <motion.h1 
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="text-2xl font-bold tracking-tight text-white flex items-center gap-2"
              >
                AuraSync Room <span className="text-neutral-500 font-mono text-lg">#{roomCode}</span>
              </motion.h1>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}?room=${roomCode}`);
                  alert('Invite link copied to clipboard!');
                }}
                className="px-4 py-2 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 rounded-lg text-sm font-semibold transition cursor-pointer"
              >
                Copy Invite Link
              </button>
              <button
                onClick={() => setIsSpatialAudioEnabled(prev => !prev)}
                className={`px-4 py-2 border rounded-lg text-sm font-semibold transition cursor-pointer flex items-center gap-2 ${
                  isSpatialAudioEnabled 
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-400 hover:bg-emerald-950/60' 
                    : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-neutral-300'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${isSpatialAudioEnabled ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
                Spatial Audio
              </button>
              <button
                onClick={handleLeaveRoom}
                className="px-4 py-2 bg-red-950/20 border border-red-900/30 text-red-400 hover:bg-red-950/40 rounded-lg text-sm font-semibold transition cursor-pointer"
              >
                Leave Room
              </button>
            </div>
          </div>



          {/* Global Search Bar - Top Position */}
          <div className="w-full">
            <LibrarySearch 
              onSelectTrack={handleSelectTrack} 
              onQueueTrack={handleQueueTrack} 
              isHost={isHost} 
              playbackPermission={currentRoom.playbackPermission}
            />
          </div>

          {/* Main Content Layout - 3 Horizontal Parts */}
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Part 1: Chat & Members */}
            <div className="lg:col-span-3 space-y-6 order-3 lg:order-1">
              <ChatBox 
                roomCode={currentRoom.code} 
                deviceId={deviceId} 
                deviceName={currentRoom.devices[deviceId]?.name || 'Device'} 
              />
            </div>

            {/* Part 2: Queue / Up Next */}
            <div className="lg:col-span-4 space-y-6 order-2">
              <QueueList room={currentRoom} isHost={isHost} />
            </div>

            {/* Part 3: Playback Focus */}
            <div className="lg:col-span-5 space-y-6 order-1 lg:order-3">
              <div className="flex flex-col gap-6">
                <AudioErrorBoundary>
                    <AudioPlayer 
                      room={currentRoom}
                      deviceId={deviceId}
                      isHost={isHost}
                      isSpatialAudioEnabled={isSpatialAudioEnabled}
                      audioRef={audioRef}
                      isBuffering={isBuffering}
                      handleEnded={handleEnded}
                      handleCanPlayThrough={handleCanPlayThrough}
                      handleWaiting={handleWaiting}
                      prebufferTimeLeft={prebufferTimeLeft}
                      currentTime={currentTime}
                      duration={duration}
                      volumeState={volumeState}
                      setVolumeState={setVolumeState}
                      audioReadyState={audioReadyState}
                      onTogglePlay={handleTogglePlay}
                      onSeek={handleSeek}
                      isScrubbing={isScrubbing}
                      scrubTime={scrubTime}
                      onScrubChange={handleScrubChange}
                      onScrubCommit={handleScrubCommit}
                      localSeekActive={localSeekActive}
                    />
                </AudioErrorBoundary>

                <RoomManagement 
                  room={currentRoom} 
                  deviceId={deviceId} 
                  isHost={isHost} 
                />
              </div>

              {isSpatialAudioEnabled && (
                <SpatialGrid 
                  room={currentRoom}
                  deviceId={deviceId}
                />
              )}
            </div>
          </div>
          
          <footer className="w-full text-center py-8 text-neutral-500 text-xs space-y-1 border-t border-neutral-900/50">
            <p>Made by <span className="text-white">xo.null._.dev</span></p>
            <p><span className="text-emerald-400">enjoy</span> 🎧</p>
          </footer>
          
          <BottomPlayer 
            currentTrack={currentRoom.currentTrack}
            room={currentRoom}
            isHost={isHost}
            deviceId={deviceId}
            audioRef={audioRef}
            volumeState={volumeState}
            currentTime={currentTime}
            duration={duration}
            onTogglePlay={handleTogglePlay}
            onSeek={handleSeek}
            isScrubbing={isScrubbing}
            scrubTime={scrubTime}
            onScrubChange={handleScrubChange}
            onScrubCommit={handleScrubCommit}
          />
          <StatsOverlay room={currentRoom} deviceId={deviceId} />
        </div>
        </AudioQueueProvider>
      )}
      </motion.div>
  );
}
