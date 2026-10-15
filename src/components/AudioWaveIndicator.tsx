import React from 'react';

interface AudioWaveIndicatorProps {
  isListening: boolean;
  audioLevel: number; // 0 to 1
  isAnalyzing: boolean;
  className?: string;
}

export const AudioWaveIndicator: React.FC<AudioWaveIndicatorProps> = ({
  isListening,
  audioLevel,
  isAnalyzing,
  className = '',
}) => {
  // Generate 16 responsive bars
  const bars = Array.from({ length: 16 });

  return (
    <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] ${className}`}>
      {bars.map((_, i) => {
        // Compute dynamic height based on audioLevel and wave offset
        const phase = Math.sin((i / 16) * Math.PI * 2);
        let heightMultiplier = 0.2;

        if (isListening) {
          const dynamicFactor = Math.max(0.15, audioLevel * 1.5);
          heightMultiplier = Math.min(1, 0.2 + dynamicFactor * (0.5 + 0.5 * Math.abs(phase)));
        } else if (isAnalyzing) {
          heightMultiplier = 0.35 + 0.3 * Math.sin(Date.now() / 200 + i * 0.4);
        }

        const heightPx = Math.max(4, Math.round(heightMultiplier * 20));

        let barColor = 'bg-slate-600';
        if (isListening) {
          barColor = audioLevel > 0.08 ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-emerald-600/70';
        } else if (isAnalyzing) {
          barColor = 'bg-cyan-400 animate-pulse';
        }

        return (
          <span
            key={i}
            className={`w-1 rounded-full transition-all duration-75 ${barColor}`}
            style={{ height: `${heightPx}px` }}
          />
        );
      })}

      <div className="ml-2 flex items-center gap-1.5 font-mono text-[11px]">
        {isListening ? (
          <>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-emerald-300 font-semibold uppercase tracking-wider">
              {audioLevel > 0.05 ? 'กำลังฟังเสียง' : 'รอคำถาม...'}
            </span>
          </>
        ) : isAnalyzing ? (
          <>
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-cyan-300 font-medium">กำลังวิเคราะห์...</span>
          </>
        ) : (
          <span className="text-slate-400">ไมค์ปิดอยู่</span>
        )}
      </div>
    </div>
  );
};
