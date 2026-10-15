import React from 'react';
import {
  Search,
  History,
  Trash2,
  Volume2,
  VolumeX,
  FileText,
  Download,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AiThinkingSpeed, InterviewMode } from '../types/interview';

interface NavbarProps {
  mode: InterviewMode;
  onToggleMode: (newMode: InterviewMode) => void;
  speed: AiThinkingSpeed;
  onChangeSpeed: (speed: AiThinkingSpeed) => void;
  useSearch: boolean;
  onToggleSearch: () => void;
  ttsEnabled: boolean;
  onToggleTts: () => void;
  isQuickStudy: boolean;
  onToggleQuickStudy: () => void;
  onOpenContext: () => void;
  onOpenSessionManager: () => void;
  onExportSession: () => void;
  onExportPdf: () => void;
  onClearSession: () => void;
  targetRole: string;
  targetCompany: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  mode,
  onToggleMode,
  speed,
  onChangeSpeed,
  useSearch,
  onToggleSearch,
  ttsEnabled,
  onToggleTts,
  isQuickStudy,
  onToggleQuickStudy,
  onOpenContext,
  onOpenSessionManager,
  onExportSession,
  onExportPdf,
  onClearSession,
  targetRole,
  targetCompany,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* Brand & Target Context */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 animate-pulse shadow-[0_0_8px_rgba(8,145,178,0.4)]" />
            <h1 className="text-sm sm:text-base font-bold text-slate-950 tracking-tight flex items-center gap-1.5">
              <span>Vanguard</span>
              <span className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-800 border border-cyan-200 font-semibold">
                EXECUTIVE
              </span>
            </h1>
          </div>

          <div
            onClick={onOpenContext}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 hover:border-slate-300 cursor-pointer text-xs text-slate-600 transition truncate max-w-[240px]"
            title="คลิกเพื่อแก้ไข Role, JD และข้อมูลผู้สมัคร"
          >
            <span className="font-semibold text-slate-900 truncate">{targetRole}</span>
            {targetCompany && (
              <>
                <span className="text-slate-400">·</span>
                <span className="text-cyan-700 truncate">{targetCompany}</span>
              </>
            )}
          </div>
        </div>

        {/* Center: Mode & Thinking Speed Controls (Hidden on mobile < sm) */}
        <div className="hidden sm:flex items-center gap-2">
          {/* Live vs Manual */}
          <div className="flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200 text-xs">
            <button
              onClick={() => onToggleMode('live')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition-all font-medium ${
                mode === 'live'
                  ? 'bg-emerald-600 text-white font-bold shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              ดักฟังสด (Live)
            </button>
            <button
              onClick={() => onToggleMode('manual')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition-all font-medium ${
                mode === 'manual'
                  ? 'bg-white text-slate-950 font-bold shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Manual
            </button>
          </div>

          {/* Model Thinking Speed */}
          <div className="hidden md:flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-mono">
            <button
              onClick={() => onChangeSpeed('fast')}
              className={`px-2 py-1 rounded-lg transition ${
                speed === 'fast'
                  ? 'bg-white text-slate-900 font-semibold shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Fast: ตอบไว latency ต่ำ"
            >
              Fast
            </button>
            <button
              onClick={() => onChangeSpeed('balanced')}
              className={`px-2 py-1 rounded-lg transition ${
                speed === 'balanced'
                  ? 'bg-cyan-100 text-cyan-800 font-semibold border border-cyan-200'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Balanced: มาตรฐาน คุณภาพสูง พร้อม Google Search"
            >
              Balanced
            </button>
            <button
              onClick={() => onChangeSpeed('deep')}
              className={`px-2 py-1 rounded-lg transition ${
                speed === 'deep'
                  ? 'bg-purple-100 text-purple-800 font-semibold border border-purple-200'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Deep: คิดเชิงลึก (High Thinking Level)"
            >
              Deep
            </button>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Quick Study toggle */}
          <button
            onClick={onToggleQuickStudy}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs transition border ${
              isQuickStudy
                ? 'text-amber-700 bg-amber-50 border-amber-200 shadow-sm font-semibold'
                : 'text-slate-500 border-transparent hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={isQuickStudy ? 'Quick Study: เปิด' : 'Quick Study: ปิด'}
          >
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">Quick</span>
          </button>

          {/* Search toggle */}
          <button
            onClick={onToggleSearch}
            className={`p-2 rounded-xl text-xs transition border ${
              useSearch
                ? 'text-cyan-700 bg-cyan-50 border-cyan-200 shadow-sm'
                : 'text-slate-500 border-transparent hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={useSearch ? 'Google Search Grounding: เปิด' : 'Google Search Grounding: ปิด'}
          >
            <Search className="w-4 h-4" />
          </button>

          {/* TTS Audio Toggle */}
          <button
            onClick={onToggleTts}
            className={`p-2 rounded-xl text-xs transition border ${
              ttsEnabled
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : 'text-slate-500 border-transparent hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={ttsEnabled ? 'AI TTS พูดอัตโนมัติ: เปิด' : 'AI TTS พูดอัตโนมัติ: ปิด'}
          >
            {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Context Modal (Resume, JD, Company) */}
          <button
            onClick={onOpenContext}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition border border-slate-200"
            title="อัปโหลดและแก้ไข JD / Resume"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-600" />
            <span className="hidden sm:inline">JD & บริบท</span>
          </button>

          {/* Export Session */}
          <div className="flex items-center gap-1">
            <button
              onClick={onExportSession}
              className="hidden sm:flex p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition border border-transparent hover:border-slate-200"
              title="ส่งออกประวัติคำถามคำตอบ (Export JSON)"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onExportPdf}
              className="hidden sm:flex p-2 rounded-xl text-slate-500 hover:text-cyan-700 hover:bg-cyan-50 transition border border-transparent hover:border-cyan-200"
              title="ดาวน์โหลดรายงาน PDF (PDF Report)"
            >
              <FileText className="w-4 h-4" />
            </button>
          </div>

          {/* Clear Session */}
          <button
            onClick={onClearSession}
            className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition border border-transparent"
            title="ล้างประวัติห้องสัมภาษณ์"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
