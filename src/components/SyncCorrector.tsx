import React, { useState, useEffect, useRef } from 'react';
import { Activity, Plus, Minus, CheckCircle, Zap } from 'lucide-react';

export default function SyncCorrector() {
  const [lastDrift, setLastDrift] = useState<number | null>(null);
  const [currentOffset, setCurrentOffset] = useState<number>(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('auraSync_hardwareOffset');
      if (stored) setCurrentOffset(parseFloat(stored));
    } catch (e) {}

    const handleSuccess = (e: any) => {
      const { drift, newOffset } = e.detail;
      setLastDrift(drift);
      setCurrentOffset(newOffset);
      
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
    };

    window.addEventListener('aura-calibration-success', handleSuccess);
    return () => window.removeEventListener('aura-calibration-success', handleSuccess);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: Event) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  const handleAutoSync = () => {
    window.dispatchEvent(new CustomEvent('request-aura-calibration'));
  };

  const adjustOffset = (amount: number) => {
    window.dispatchEvent(new CustomEvent('request-aura-adjustment', { detail: { adjustment: amount } }));
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2.5 bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-400 font-medium rounded-xl text-xs border border-emerald-500/50 flex items-center gap-1.5 transition-all"
        title="Auto-correct hardware latency"
      >
        <Zap className="w-3.5 h-3.5" />
        <span className="font-mono">Auto-Sync</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 md:left-auto md:right-0 bottom-full mb-2 w-64 bg-[#181a20]/95 backdrop-blur-md border border-emerald-900/40 p-4 rounded-xl shadow-[0_0_30px_rgba(16,185,129,0.15)] z-50 flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono font-bold text-emerald-400 tracking-widest uppercase">Auto-Calibration</span>
          </div>
          
          <button
            onClick={handleAutoSync}
            className={`w-full py-2 px-3 rounded-lg font-mono font-bold text-xs flex items-center justify-center gap-2 transition-all duration-300 ${
              isSuccess 
                ? 'bg-emerald-500 text-[#0f1115] shadow-[0_0_20px_rgba(16,185,129,0.4)] scale-[0.98]' 
                : 'bg-zinc-900 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/30 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]'
            }`}
          >
            {isSuccess ? (
              <>
                <CheckCircle size={14} />
                OPTIMIZED
              </>
            ) : (
              <>
                <Activity size={14} className="animate-pulse" />
                RUN AUTO-SYNC
              </>
            )}
          </button>

          <div className="flex justify-between font-mono text-[10px] text-zinc-400 bg-zinc-950/50 p-2 rounded-lg border border-zinc-800">
            <div className="flex flex-col flex-1">
              {lastDrift !== null && lastDrift !== 0 && (
                <span className="text-emerald-400/80 mb-0.5 whitespace-nowrap">
                  Drift: {Math.round(lastDrift)}ms
                </span>
              )}
              <span className="whitespace-nowrap">Offset: {Math.round(currentOffset)}ms</span>
            </div>
            <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
              <button 
                onClick={() => adjustOffset(-10)}
                className="p-1 bg-zinc-900 hover:bg-zinc-800 rounded text-emerald-400 transition-colors"
                title="Reduce 10ms delay"
              >
                <Minus size={10} strokeWidth={3} />
              </button>
              <button 
                onClick={() => adjustOffset(10)}
                className="p-1 bg-zinc-900 hover:bg-zinc-800 rounded text-emerald-400 transition-colors"
                title="Add 10ms delay"
              >
                <Plus size={10} strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
