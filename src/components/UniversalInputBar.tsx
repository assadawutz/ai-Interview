import React, { useState, useRef } from 'react';
import {
  Mic,
  MicOff,
  Send,
  Paperclip,
  Square,
  Sparkles,
} from 'lucide-react';
import { InterviewMode } from '../types/interview';

interface UniversalInputBarProps {
  mode: InterviewMode;
  isListening: boolean;
  onToggleMic: () => void;
  onSubmitQuestion: (questionText: string) => void;
  isAnalyzing: boolean;
  onStopAnalysis?: () => void;
  onUploadFile?: () => void;
  audioLevel: number;
}

const PRESET_QUESTIONS = [
  'แนะนำตัวเองให้น่าจดจำใน 2 นาที',
  'จุดอ่อนของคุณคืออะไรและรับมืออย่างไร',
  'ทำไมถึงตัดสินใจลาออกจากที่เดิม',
  'การจัดการความขัดแย้งในทีม',
  'คำถามที่ดีที่สุดที่ควรถามผู้สัมภาษณ์กลับ',
];

export const UniversalInputBar: React.FC<UniversalInputBarProps> = ({
  mode,
  isListening,
  onToggleMic,
  onSubmitQuestion,
  isAnalyzing,
  onStopAnalysis,
  onUploadFile,
  audioLevel,
}) => {
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isAnalyzing) return;
    onSubmitQuestion(inputText.trim());
    setInputText('');
  };

  return (
    <div className="w-full space-y-2">
      {/* Quick Prompts Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs pb-0.5">
        <span className="text-[10px] text-slate-400 font-mono uppercase shrink-0">ตัวอย่างคำถาม:</span>
        {PRESET_QUESTIONS.map((q, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSubmitQuestion(q)}
            disabled={isAnalyzing}
            className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 transition text-[11px] disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Main Command Bar */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 p-1.5 sm:p-2 rounded-2xl bg-slate-900/90 border border-slate-800 focus-within:border-cyan-500/60 shadow-xl backdrop-blur-md transition-all"
      >
        {/* Microphone Button with glowing pulse */}
        <button
          type="button"
          onClick={onToggleMic}
          className={`p-2.5 sm:p-3 rounded-xl flex items-center justify-center transition-all ${
            isListening
              ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.5)] scale-105'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
          }`}
          title={isListening ? 'คลิกเพื่อปิดไมค์' : 'คลิกเพื่อเปิดไมค์ดักฟังคำถาม'}
        >
          {isListening ? (
            <Mic className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
          ) : (
            <MicOff className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
          )}
        </button>

        {/* Input Text Box */}
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={
            isListening
              ? 'ระบบกำลังดักฟังเสียงสัมภาษณ์อัตโนมัติ... หรือพิมพ์คำถามที่นี่'
              : 'พิมพ์หรือพูดคำถามสัมภาษณ์ เพื่อวิเคราะห์และล็อคคำตอบ...'
          }
          className="flex-1 bg-transparent border-none text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none px-2"
        />

        {/* File upload trigger */}
        {onUploadFile && (
          <button
            type="button"
            onClick={onUploadFile}
            className="p-2 text-slate-400 hover:text-cyan-300 transition"
            title="อัปโหลด Resume หรือ JD"
          >
            <Paperclip className="w-4 h-4" />
          </button>
        )}

        {/* Send / Stop Action */}
        {isAnalyzing ? (
          <button
            type="button"
            onClick={onStopAnalysis}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">หยุด</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="px-3.5 sm:px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-slate-950 text-xs font-bold flex items-center gap-1.5 transition shadow-sm shadow-cyan-500/20"
          >
            <span>วิเคราะห์</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        )}
      </form>
    </div>
  );
};
