import React, { useRef, useState, useEffect } from 'react';
import { motion, useMotionValue } from 'motion/react';
import { 
  Compass, 
  MapPin, 
  HelpCircle, 
  Tv, 
  Volume2, 
  Smartphone, 
  Radio 
} from 'lucide-react';
import { RoomState, DeviceInfo } from '../types';
import { updateDeviceState, updateRoomPlayerState } from '../lib/p2p';

interface SpatialGridProps {
  room: RoomState;
  deviceId: string;
}

export default function SpatialGrid({ room, deviceId }: SpatialGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const localDevice = room.devices[deviceId] || {
    id: deviceId,
    name: 'Sync Buddy',
    isHost: false,
    ping: 0,
    offset: 0,
    x: 50,
    y: 50,
    volume: 1.0,
    spatialAudioEnabled: false
  };

  // Sound emitter/source position fixed at the exact center (50, 50)
  const sourcePoint = { x: 50, y: 50 };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    // Capture initial location coordinates
    container.setPointerCapture(e.pointerId);
    updatePosition(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container || !container.hasPointerCapture(e.pointerId)) return;

    updatePosition(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    container.releasePointerCapture(e.pointerId);
  };

  const updatePosition = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const relativeY = e.clientY - rect.top;

    // Convert pixel to scale of 0 to 100 with bounds clamping
    const calculatedX = Math.max(0, Math.min(100, (relativeX / rect.width) * 100));
    const calculatedY = Math.max(0, Math.min(100, (relativeY / rect.height) * 100));

    // Calculate volume based on inverse distance from the center emitter
    const distance = Math.hypot(calculatedX - sourcePoint.x, calculatedY - sourcePoint.y);
    const maxDistance = Math.hypot(50, 50); // maximum potential distance is from center to a corner
    // Decaying audio volume mapped linearly
    const volumeLevel = Math.max(0.05, 1 - (distance / (maxDistance * 0.95)));

    // Emit back to the Room update state on databases
    updateDeviceState(room.code, deviceId, {
      x: parseFloat(calculatedX.toFixed(1)),
      y: parseFloat(calculatedY.toFixed(1)),
      volume: parseFloat(volumeLevel.toFixed(2))
    });
  };

  const performSmartSetup = () => {
    if (!localDevice.isHost) return;

    // Toggle setup active state
    const newActiveState = !room.spatialSetupActive;

    updateRoomPlayerState(room.code, room.isPlaying, room.startTime, room.pauseOffset, room.audioSource, room.currentTrack, room.queue, room.history, newActiveState);

    // If enabling, run the automatic device roles assignment
    if (newActiveState) {
        const devices = Object.values(room.devices);
        const count = devices.length;
        
        devices.forEach((device, index) => {
            let role: 'left' | 'right' | 'center' | 'surround-left' | 'surround-right' = 'center';
            
            if (count === 1) role = 'center';
            else if (count === 2) role = index === 0 ? 'left' : 'right';
            else if (count === 3) role = index === 0 ? 'left' : (index === 1 ? 'right' : 'center');
            else role = index % 2 === 0 ? 'left' : 'right';
            
            updateDeviceState(room.code, device.id, { spatialRole: role });
        });
    }
  };

  const updateSpatialAudio = (enable: boolean) => {
    updateDeviceState(room.code, deviceId, { spatialAudioEnabled: enable });
  };

  return (
    <div className="bg-[#181a20] border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Header section with description */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <span className="text-xs font-mono uppercase tracking-widest text-[#10b981] font-semibold flex items-center gap-1">
            <Compass size={14} /> Immersive Room Coordinates
          </span>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-3">
              Devices Mapping
              {localDevice.isHost ? (
                  <button 
                      onClick={performSmartSetup}
                      className={`text-[10px] font-bold py-1 px-2 rounded-full transition ${room.spatialSetupActive ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white`}
                  >
                      {room.spatialSetupActive ? 'Stop Spatial Setup' : 'Auto-Setup Channels'}
                  </button>
              ) : (
                  <button 
                      onClick={() => updateSpatialAudio(!(localDevice.spatialAudioEnabled ?? false))}
                      className={`text-[10px] font-bold py-1 px-2 rounded-full transition ${(localDevice.spatialAudioEnabled ?? false) ? 'bg-emerald-600' : 'bg-neutral-700'} text-white`}
                  >
                      {(localDevice.spatialAudioEnabled ?? false) ? 'Spatial ON' : 'Spatial OFF'}
                  </button>
              )}
          </h2>
          <p className="text-xs text-neutral-400">
            Drag your device around the grid. Closer to the core sound-emitter boosts your volume.
          </p>
        </div>

        <button
          onClick={() => setShowInfo(!showInfo)}
          className="text-neutral-500 hover:text-neutral-300 transition"
          title="Spatial guide info"
        >
          <HelpCircle size={18} />
        </button>
      </div>

      {showInfo && (
        <div className="p-3 bg-neutral-900 border border-neutral-800/80 rounded-xl text-xs space-y-1 text-neutral-400 leading-relaxed">
          <p className="font-semibold text-neutral-200">How Spatial Audio Mapping Works:</p>
          <p>
            The center beacon represents the <b>Sound Emitter Node</b>. Positioning your device closer to it increases your dynamic speaker volume level. Move far away to mute or calibrate individual system nodes easily.
          </p>
        </div>
      )}

      {/* Grid Canvas Canvas View */}
      <div 
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative w-full aspect-square md:aspect-[1.6/1] bg-[#111215] border border-neutral-800/50 rounded-2xl overflow-hidden cursor-crosshair select-none"
      >
        {/* Decorative Radar & Coordinate Lines */}
        <div className="absolute inset-0 grid grid-cols-10 grid-rows-10 pointer-events-none opacity-[0.03]">
          {Array(100).fill(0).map((_, i) => (
            <div key={i} className="border border-white/50" />
          ))}
        </div>

        {/* Dynamic ripple radar rings around the central Sound-Emitter */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center">
          <div className="w-16 h-16 border border-emerald-500/25 rounded-full animate-ping opacity-60 absolute duration-3000" />
          <div className="w-32 h-32 border border-emerald-500/10 rounded-full absolute" />
          <div className="w-64 h-64 border border-zinc-800/50 rounded-full absolute" />
          <div className="w-96 h-96 border border-zinc-900/50 rounded-full absolute" />
        </div>

        {/* Static Central Sound Beacon */}
        <motion.div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/60 shadow-lg shadow-emerald-500/5"
            animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <Radio className="w-5 h-5 text-emerald-400" />
          <span className="text-[9px] font-mono font-bold tracking-widest text-emerald-400 mt-1 uppercase">EMITTER</span>
        </motion.div>

        {/* Rendering connected Device Nodes in real-time */}
        {Object.values(room.devices).map((device: DeviceInfo) => {
          const isMe = device.id === deviceId;
          
          return (
            <motion.div
              key={device.id}
              className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center p-2 rounded-xl border shadow-xl cursor-grab active:cursor-grabbing ${
                isMe 
                  ? 'bg-neutral-900 border-emerald-500 text-white z-20 shadow-emerald-500/10' 
                  : 'bg-neutral-950/80 border-neutral-800 text-neutral-400 z-10'
              }`}
              style={{
                left: `${device.x}%`,
                top: `${device.y}%`
              }}
              whileHover={{ scale: 1.15, zIndex: 30 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              {/* Device Icon Indicators */}
              <div className="flex items-center space-x-1">
                {device.spatialRole && (
                    <span className="text-[8px] bg-neutral-800 text-neutral-300 font-bold px-1 rounded mr-1 uppercase">
                        {device.spatialRole}
                    </span>
                )}
                {device.isHost ? (
                  <Tv size={12} className="text-[#10b981]" />
                ) : (
                  <Smartphone size={12} className={isMe ? "text-emerald-400" : "text-neutral-500"} />
                )}
                <span className="text-[10px] font-bold font-mono tracking-tighttruncate truncate max-w-[70px]">
                  {device.name}
                </span>
                {isMe && <span className="text-[8px] bg-emerald-500/20 text-emerald-400 font-mono font-extrabold px-1 rounded uppercase">ME</span>}
              </div>

              {/* Volume status tracking indicators */}
              <div className="flex items-center space-x-1 mt-1 text-[9px] opacity-80 font-mono">
                <Volume2 size={8} />
                <span>Vol: {Math.round(device.volume * 100)}%</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Grid Coordinates status list footer */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        <div className="p-3 bg-neutral-900/60 border border-neutral-800/60 rounded-xl">
          <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest font-mono">Coordinates</div>
          <p className="text-sm font-bold text-neutral-200 mt-1 font-mono">
            X: {Math.round(localDevice.x)} / Y: {Math.round(localDevice.y)}
          </p>
        </div>

        <div className="p-3 bg-neutral-900/60 border border-neutral-800/60 rounded-xl">
          <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest font-mono">Dynamic Gain</div>
          <p className="text-sm font-bold text-emerald-400 mt-1 font-mono">
            {(localDevice.volume * 1.0).toFixed(2)}x Multiplier
          </p>
        </div>

        <div className="p-3 bg-neutral-900/60 border border-neutral-800/60 rounded-xl">
          <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest font-mono">Latency Jitter</div>
          <p className="text-sm font-bold text-neutral-200 mt-1 font-mono">
            {localDevice.ping ? `${localDevice.ping} ms` : 'Calibrating'}
          </p>
        </div>
      </div>
    </div>
  );
}
