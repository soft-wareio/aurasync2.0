import React, { useEffect, useState } from 'react';
import { RoomState } from '../types';
import { syncEngine } from '../lib/syncEngine';
import { useDiagnostics } from '../lib/diagnostics';
import { Activity, X } from 'lucide-react';

interface StatsOverlayProps {
  room: RoomState;
  deviceId: string;
}

export default function StatsOverlay({ room, deviceId }: StatsOverlayProps) {
  const [latency, setLatency] = useState<number>(0);
  const diagStats = useDiagnostics();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Periodically update latency visually from the sync engine
    const unsubscribe = syncEngine.subscribe((stats) => {
      setLatency(stats.ping);
    });
    
    // Also set a timer to sync just to be safe although subscribe should be enough
    const interval = setInterval(() => {
      syncEngine.calibrate(2); // Calibrate continuously for real-time ping updates
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const devices = room.devices ? Object.values(room.devices) : [];
  const activeCount = devices.filter(d => (Date.now() - d.lastActive) < 30000).length;

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 left-6 z-50 p-3 bg-neutral-900/90 backdrop-blur border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-emerald-400 rounded-2xl shadow-2xl transition pointer-events-auto flex items-center gap-2"
        >
          <Activity size={18} />
          <span className="text-[10px] font-mono font-bold tracking-wider">STATS</span>
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 left-6 z-50 pointer-events-none">
          <div className="bg-neutral-900/80 backdrop-blur-md border border-neutral-800 p-4 rounded-xl shadow-2xl min-w-[240px] max-w-[300px] pointer-events-auto">
            <div className="flex items-center justify-between mb-3 border-b border-neutral-800 pb-2">
              <span className="text-[10px] font-mono font-bold text-neutral-400 tracking-wider">AURA_SYNC_STATS</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">ONLINE</span>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-neutral-500 hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-500 font-medium">Latency (Ping)</span>
                <span className="text-neutral-300 font-mono font-bold">{latency}ms</span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-500 font-medium">Active Nodes</span>
                <span className="text-neutral-300 font-mono font-bold">{activeCount} / {devices.length}</span>
              </div>

              <div className="flex justify-between items-center text-xs mt-2 pt-2 border-t border-neutral-800/50">
                <span className="text-neutral-500 font-medium">True RTT (Test)</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {diagStats.latencyMs ? `${Math.round(diagStats.latencyMs)}ms` : 'Testing...'}
                </span>
              </div>
              
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-500 font-medium">Clock Offset</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {diagStats.clockOffsetMs ? `${Math.round(diagStats.clockOffsetMs)}ms` : 'Testing...'}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-500 font-medium">Join Render Time</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {diagStats.joinTimeMs ? `${Math.round(diagStats.joinTimeMs)}ms` : 'Testing...'}
                </span>
              </div>
              
              {diagStats.joinTimeMs && diagStats.joinTimeMs > 5000 && (
                <div className="text-[10px] text-amber-400 mt-1 font-mono leading-tight bg-amber-400/10 p-1.5 rounded">
                  ⚠️ OPTIMIZATION WARNING: Room activation took &gt;5s
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-800">
              <span className="text-[10px] font-mono font-bold text-neutral-500 block mb-2 tracking-wider">NETWORK TOPOLOGY</span>
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                {devices.map((dev, idx) => {
                  const isMe = dev.id === deviceId;
                  const isActive = (Date.now() - dev.lastActive) < 30000;
                  return (
                    <div key={idx} className="flex justify-between items-center text-[10px] font-mono">
                      <div className="flex items-center gap-1.5 min-w-0 pr-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-neutral-700'}`} />
                        <span className={`truncate max-w-[80px] ${isMe ? 'text-emerald-400 font-bold' : 'text-neutral-400'}`}>
                          {dev.name || dev.id}
                          {isMe && ' (You)'}
                        </span>
                      </div>
                      <span className="text-neutral-600 bg-neutral-950 px-1 rounded border border-neutral-800">
                        {dev.isHost ? 'HOST' : 'PEER'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
