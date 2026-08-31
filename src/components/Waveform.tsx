import React from 'react';

const BARS = 80; 
export const WAVEFORM_DATA = Array.from({length: BARS}).map((_, i) => {
  const sin1 = Math.sin(i * 0.2);
  const sin2 = Math.sin(i * 0.08 + 1);
  const noise = (Math.sin(i * 15.345) + 1) / 2;
  const height = (sin1 * 0.35 + sin2 * 0.45 + noise * 0.2 + 1.2) / 2 * 60 + 20;
  return Math.min(100, Math.max(10, height));
});

interface WaveformProps {
  progressPercent: number;
  isActive?: boolean;
}

export function Waveform({ progressPercent, isActive = true }: WaveformProps) {
  const activePercent = isNaN(progressPercent) || !isFinite(progressPercent) ? 0 : progressPercent;

  return (
    <svg preserveAspectRatio="none" viewBox="0 0 100 100" className="w-full h-full block">
      <g>
        {WAVEFORM_DATA.map((h, i) => {
          const barPct = (i / BARS) * 100;
          const isBarPlayed = barPct <= activePercent;
          const barColor = isBarPlayed 
            ? (isActive ? '#10b981' : '#a3a3a3') 
            : 'rgba(255, 255, 255, 0.15)';        

          return (
            <rect 
              key={`bar-${i}`} 
              x={(i / BARS) * 100} 
              y={50 - h/2} 
              width={100 / BARS - 0.3} 
              height={h} 
              rx="0.4"
              fill={barColor}
              className="transition-colors duration-100"
            />
          );
        })}
      </g>
    </svg>
  );
}
