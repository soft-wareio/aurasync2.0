import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, ArrowRight, RefreshCw, Volume2, Plus, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { generateRoomCode } from '../lib/p2p';

const ADJECTIVES = [
  'active', 'productive', 'syncing', 'sonic', 'rhythm', 'dancing', 'grooving', 'tuned',
  'harmonic', 'spatial', 'stereo', 'resonant', 'bouncing', 'vibrant', 'ambient', 'cosmic'
];

const NOUNS = [
  'dog', 'otter', 'dolphin', 'fox', 'panda', 'koala', 'badger', 'rabbit', 'panther',
  'falcon', 'owl', 'lynx', 'seal', 'lemur', 'beaver', 'squirrel'
];

function generateRandomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}

interface RoomJoinerProps {
  onJoin: (code: string, deviceName: string, isHost: boolean) => void;
  isLoading: boolean;
  errorMsg: string | null;
}

export default function RoomJoiner({ onJoin, isLoading, errorMsg }: RoomJoinerProps) {
  const [code, setCode] = useState<string[]>(Array(6).fill(''));
  const [deviceName, setDeviceName] = useState<string>('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Initialize random name on load
  useEffect(() => {
    setDeviceName(generateRandomName());
  }, []);

  const handleRegenerateName = () => {
    setDeviceName(generateRandomName());
  };

  const handleChange = (index: number, val: string) => {
    // Only allow single digit numeric input
    const cleanVal = val.replace(/[^0-9]/g, '');
    if (!cleanVal) {
      const newCode = [...code];
      newCode[index] = '';
      setCode(newCode);
      return;
    }

    const valueStr = cleanVal.slice(-1);
    const newCode = [...code];
    newCode[index] = valueStr;
    setCode(newCode);

    // Focus next input
    if (index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1]?.focus();
    }
    
    // Auto-join if complete
    if (newCode.join('').length === 6) {
      onJoin(newCode.join(''), deviceName, false);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!code[index] && index > 0 && inputRefs.current[index - 1]) {
        const newCode = [...code];
        newCode[index - 1] = '';
        setCode(newCode);
        inputRefs.current[index - 1]?.focus();
      } else {
        const newCode = [...code];
        newCode[index] = '';
        setCode(newCode);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim().replace(/[^0-9]/g, '');
    if (pastedData.length >= 6) {
      const digits = pastedData.slice(0, 6).split('');
      setCode(digits);
      inputRefs.current[5]?.focus();
      onJoin(digits.join(''), deviceName, false);
    }
  };

  const handleCreateRoom = () => {
    const randomCode = generateRoomCode();
    onJoin(randomCode, deviceName, true);
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 min-h-screen bg-[#0d0e12] text-white selection:bg-neutral-800 selection:text-neutral-200">
      <div className="w-full max-w-md bg-[#13151a] border border-neutral-800/80 rounded-2xl p-8 shadow-2xl space-y-8 animate-fade-in">
        


        {/* Brand Title */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-neutral-100 via-neutral-300 to-neutral-400 bg-clip-text text-transparent">
            Join Aura Sync Room
          </h1>
          <p className="text-sm text-neutral-400 font-medium">
            Enter a room code to join or create a new room
          </p>
        </div>

        {/* 6-Digit Verification Inputs */}
        <div className="flex justify-center gap-2" onPaste={handlePaste}>
          {code.map((digit, idx) => {
            const isFilled = digit !== '';
            return (
              <motion.input
                key={idx}
                ref={(el) => (inputRefs.current[idx] = el)}
                type="text"
                pattern="[0-9]*"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                disabled={isLoading}
                animate={{
                  scale: isFilled ? 1.08 : 1,
                  borderColor: isFilled ? '#10b981' : '#262626',
                  boxShadow: isFilled
                    ? '0 0 15px rgba(16, 185, 129, 0.4)'
                    : 'none',
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                className="w-12 h-14 text-center text-xl font-bold rounded-lg border bg-[#13151a] focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 text-white select-none transition-shadow"
                style={{
                  color: isFilled ? '#10b981' : '#ffffff',
                }}
              />
            );
          })}
        </div>

        {/* User Alias Section */}
        <div className="flex items-center justify-center space-x-2 text-sm text-neutral-400">
          <span>You'll join as</span>
          <span className="font-bold text-neutral-100 font-mono tracking-wide">{deviceName}</span>
          <button 
            type="button"
            onClick={handleRegenerateName}
            className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
            title="Generate custom name"
          >
            <RefreshCw size={14} className="hover:rotate-180 transition-transform duration-500" />
          </button>
        </div>

        {/* Create room CTA Button */}
        <button
          type="button"
          onClick={handleCreateRoom}
          disabled={isLoading}
          className="w-full h-12 flex items-center justify-center space-x-2 bg-white text-[#0f1115] hover:bg-neutral-200 font-semibold rounded-full transition-all duration-300 transform active:scale-95 cursor-pointer shadow-lg disabled:opacity-50"
        >
          <Plus size={18} className="stroke-[3]" />
          <span>Create Room</span>
        </button>

        {/* Error Output */}
        {errorMsg && (
          <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-xl text-center text-xs text-red-400 font-medium animate-pulse">
            {errorMsg}
          </div>
        )}

        {/* Playback hint */}
        <div className="flex items-center justify-center space-x-1 text-xs text-neutral-500 font-medium pt-2">
          <Volume2 size={12} className="text-neutral-600" />
          <span>Use native device speakers for optimal room playback.</span>
        </div>
      </div>
    </div>
  );
}
