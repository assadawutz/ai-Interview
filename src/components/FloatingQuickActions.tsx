import React, { useState } from 'react';
import {
  Square,
  Sparkles,
  Zap,
  Maximize2,
  Minimize2,
  ChevronUp,
  ChevronDown,
  Layers,
  VolumeX,
} from 'lucide-react';
import { AiThinkingSpeed } from '../types/interview';

interface FloatingQuickActionsProps {
  onEmergencyStop: () => void;
  currentTone: string;
  onChangeTone: (tone: string) => void;
  speed: AiThinkingSpeed;
  onChangeSpeed: (speed: AiThinkingSpeed) => void;
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
}

export const FloatingQuickActions: React.FC<FloatingQuickActionsProps> = ({
  onEmergencyStop,
  currentTone,
  onChangeTone,
  speed,
  onChangeSpeed,
  isFocusMode,
  onToggleFocusMode,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const tones = ['Assertive', 'Consultative', 'Concise'];

  const cycleTone = () => {
    const nextIndex = (tones.indexOf(currentTone) + 1) % tones.length;
    onChangeTone(tones[nextIndex]);
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
      {isExpanded && (
        <div className="flex flex-col gap-2 p-2 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-2xl text-xs text-white transition-all animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="px-2 py-1 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 flex items-center justify-between gap-4">
            <span>Quick Controls</span>
            <span className="text-cyan-400">High-Stakes HUD</span>
          </div>

          {/* 1. Emergency Stop Button */}
          <button
            onClick={onEmergencyStop}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-600 active:scale-95 text-white font-bold transition shadow-md shadow-rose-950/50"
            title="หยุดการทำงานของ AI และการดักฟังทันที (Emergency Stop)"
          >
            <Square className="w-3.5 h-3.5 fill-white" />
            <span>Emergency Stop</span>
          </button>

          {/* 2. Toggle AI Tone */}
          <button
            onClick={cycleTone}
            className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 transition border border-slate-700"
            title="สลับโทนคำตอบของ AI (Assertive, Consultative, Concise)"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>AI Tone:</span>
            </div>
            <span className="font-mono font-bold text-cyan-300 px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-[10px]">
              {currentTone}
            </span>
          </button>

          {/* 3. Deep-Dive Mode */}
          <button
            onClick={() => onChangeSpeed(speed === 'deep' ? 'balanced' : 'deep')}
            className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl transition border active:scale-95 ${
              speed === 'deep'
                ? 'bg-purple-600 text-white font-bold border-purple-400 shadow-md shadow-purple-950/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="เปิด/ปิด โหมดคิดวิเคราะห์เชิงลึก (Deep-Dive Model)"
          >
            <div className="flex items-center gap-2">
              <Zap className={`w-3.5 h-3.5 ${speed === 'deep' ? 'text-amber-300' : 'text-purple-400'}`} />
              <span>Deep-Dive</span>
            </div>
            <span className="font-mono text-[10px] uppercase font-bold">
              {speed === 'deep' ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* 4. Focus Mode Toggle */}
          <button
            onClick={onToggleFocusMode}
            className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl transition border active:scale-95 ${
              isFocusMode
                ? 'bg-cyan-600 text-white font-bold border-cyan-400 shadow-md shadow-cyan-950/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="เปิด/ปิด Focus Mode (Cmd/Ctrl+F)"
          >
            <div className="flex items-center gap-2">
              {isFocusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span>Focus Mode</span>
            </div>
            <span className="font-mono text-[9px] text-slate-400">Ctrl+F</span>
          </button>
        </div>
      )}

      {/* Floating Toggle Pill */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-2 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700 shadow-xl text-xs text-slate-200 transition-all font-medium active:scale-95"
        title={isExpanded ? 'ย่อแถบเมนูด่วน' : 'ขยายแถบเมนูด่วน'}
      >
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        <span className="font-semibold text-white">Action HUD</span>
        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronUp className="w-3.5 h-3.5 text-slate-400" />}
      </button>
    </div>
  );
};
