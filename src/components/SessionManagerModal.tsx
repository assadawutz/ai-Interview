import React, { useState } from 'react';
import {
  X,
  History,
  Download,
  Trash2,
  Save,
  Clock,
  Shield,
  RotateCcw,
  CheckCircle2,
  FileJson,
  Sparkles,
} from 'lucide-react';
import { CandidateContext, InterviewSession, QueuedQuestion, SmartAnswer } from '../types/interview';

interface SessionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentQuestions: QueuedQuestion[];
  currentAnswers: SmartAnswer[];
  currentContext: CandidateContext;
  onRestoreSession: (session: InterviewSession) => void;
  onClearCurrentSession: () => void;
  autoExpireHours: number;
  onChangeAutoExpire: (hours: number) => void;
  minConfidence: number;
  onChangeMinConfidence: (conf: number) => void;
  autoSpeak: boolean;
  onToggleAutoSpeak: () => void;
}

const STORAGE_KEY = 'interviewpulse_saved_sessions_v1';

export const SessionManagerModal: React.FC<SessionManagerModalProps> = ({
  isOpen,
  onClose,
  currentQuestions,
  currentAnswers,
  currentContext,
  onRestoreSession,
  onClearCurrentSession,
  autoExpireHours,
  onChangeAutoExpire,
  minConfidence,
  onChangeMinConfidence,
  autoSpeak,
  onToggleAutoSpeak,
}) => {
  const [sessions, setSessions] = useState<InterviewSession[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed: InterviewSession[] = JSON.parse(raw);
      const now = Date.now();
      // Auto-filter expired sessions
      return parsed.filter((s) => {
        const expireMs = (s.autoExpireHours || 24) * 60 * 60 * 1000;
        return now - s.lastUpdated < expireMs;
      });
    } catch {
      return [];
    }
  });

  const [sessionTitle, setSessionTitle] = useState(
    `สัมภาษณ์ ${currentContext.role || 'ตำแหน่งงาน'} - ${currentContext.targetCompany || 'บริษัท'}`
  );
  const [showHighlightsOnly, setShowHighlightsOnly] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const saveToLocalStorage = (updated: InterviewSession[]) => {
    setSessions(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save sessions:', e);
    }
  };

  const handleSaveCurrentSession = () => {
    if (currentQuestions.length === 0 && currentAnswers.length === 0) {
      setFeedbackMsg('⚠️ ยังไม่มีคำถามหรือคำตอบในเซสชันปัจจุบัน');
      return;
    }

    const newSession: InterviewSession = {
      id: `session_${Date.now()}`,
      title: sessionTitle.trim() || `สัมภาษณ์ ${new Date().toLocaleDateString()}`,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      autoExpireHours,
      context: { ...currentContext },
      questions: [...currentQuestions],
      answers: [...currentAnswers],
    };

    const updated = [newSession, ...sessions.filter((s) => s.id !== newSession.id)];
    saveToLocalStorage(updated);
    setFeedbackMsg('✅ บันทึกเซสชันการสัมภาษณ์ลงระบบเรียบร้อย');
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleDeleteSession = (id: string) => {
    const updated = sessions.filter((s) => s.id !== id);
    saveToLocalStorage(updated);
  };

  const handleExportJson = (sessionToExport?: InterviewSession) => {
    const target = sessionToExport || {
      id: `session_${Date.now()}`,
      title: sessionTitle,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      autoExpireHours,
      context: currentContext,
      questions: currentQuestions,
      answers: currentAnswers,
    };

    const blob = new Blob([JSON.stringify(target, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-session-${(target.context?.targetCompany || 'log').toLowerCase()}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleWipeAll = () => {
    if (window.confirm('ยืนยันการล้างประวัติเซสชันทั้งหมดเพื่อความเป็นส่วนตัวหรือไม่? (ไม่สามารถกู้คืนได้)')) {
      saveToLocalStorage([]);
      onClearCurrentSession();
      setFeedbackMsg('🗑️ ล้างประวัติเซสชันและข้อมูลแคชทั้งหมดเรียบร้อยแล้ว');
      setTimeout(() => setFeedbackMsg(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden my-8">
        {/* Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-purple-500 animate-fluid-gradient" />

        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                ระบบจัดการเซสชัน (Session & Privacy Management)
              </h2>
              <p className="text-[11px] text-slate-400">
                เก็บบันทึกประวัติการสัมภาษณ์ ส่งออก JSON และตั้งค่าล้างข้อมูลอัตโนมัติเพื่อความเป็นส่วนตัว
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* 1. Save Current Session */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
              <Save className="w-3.5 h-3.5" />
              บันทึกเซสชันปัจจุบัน (Save Active Session)
            </span>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                placeholder="ระบุชื่อเซสชัน เช่น สัมภาษณ์ Technical รอบที่ 2 กับ Agoda"
                className="flex-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveCurrentSession}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-[0_0_12px_rgba(6,182,212,0.3)] flex items-center gap-1.5 shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>บันทึกเซสชัน</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportJson()}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
                  title="ส่งออกเซสชันปัจจุบันเป็น JSON ทันที"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </button>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center gap-3">
              <span>คำถามในเซสชัน: {currentQuestions.length} ข้อ</span>
              <span>•</span>
              <span>คำตอบที่วิเคราะห์: {currentAnswers.length} ข้อ</span>
            </div>
          </div>

          {/* 2. Auto-Expire & Privacy Settings */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                นโยบายความเป็นส่วนตัว & ล้างประวัติอัตโนมัติ
              </span>
              <span className="text-[10px] text-slate-400 font-mono">DATA LIFECYCLE</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { hours: 2, label: '2 ชม. (ความปลอดภัยสูง)' },
                { hours: 6, label: '6 ชม.' },
                { hours: 24, label: '24 ชม. (แนะนำ)' },
                { hours: 72, label: '3 วัน' },
              ].map((opt) => (
                <button
                  key={opt.hours}
                  type="button"
                  onClick={() => onChangeAutoExpire(opt.hours)}
                  className={`p-2.5 rounded-lg border text-xs font-medium transition-all text-center ${
                    autoExpireHours === opt.hours
                      ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              เมื่อครบกำหนดเวลา ข้อมูลคำถามและคำตอบที่บันทึกไว้ในเบราว์เซอร์จะถูกล้างทิ้งอัตโนมัติเพื่อป้องกันข้อมูลส่วนตัวรั่วไหล
            </p>
          </div>

          {/* AI Preferences & Queue Confidence Settings */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                ตั้งค่าระบบคิวคำถาม & เสียงพูดอัตโนมัติ (AI Preferences)
              </span>
              <span className="text-[10px] text-slate-400 font-mono">SETTINGS</span>
            </div>

            {/* Min Confidence Threshold Setting */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">ระดับความมั่นใจขั้นต่ำ (Minimum Confidence): <strong className="text-cyan-400">{minConfidence}%</strong></span>
                <span className="text-[11px] text-slate-400">กรองเฉพาะคำถามที่มั่นใจสูง</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[40, 60, 75, 85].map((thresh) => (
                  <button
                    key={thresh}
                    type="button"
                    onClick={() => onChangeMinConfidence(thresh)}
                    className={`py-2 px-3 rounded-lg border text-xs font-mono font-semibold transition ${
                      minConfidence === thresh
                        ? 'bg-cyan-950/80 border-cyan-500/60 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ≥ {thresh}%
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-Speak Setting */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <div>
                <div className="text-xs font-medium text-white">Auto-Speak (อ่านคำตอบอัตโนมัติเมื่อ Locked)</div>
                <div className="text-[11px] text-slate-400">เล่นเสียง AI TTS ทันทีเมื่อคำตอบถูกล็อคโดยไม่ต้องกดเอง</div>
              </div>
              <button
                type="button"
                onClick={onToggleAutoSpeak}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  autoSpeak
                    ? 'bg-emerald-500 text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>{autoSpeak ? 'ENABLED (เปิด)' : 'DISABLED (ปิด)'}</span>
              </button>
            </div>
          </div>

          {/* Highlight Reel Filter */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-700">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-slate-300 font-medium">Highlight Reel (Confidence &gt; 95%)</span>
            </div>
            <button
              type="button"
              onClick={() => setShowHighlightsOnly(!showHighlightsOnly)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${showHighlightsOnly ? 'bg-amber-950 text-amber-300 border border-amber-500' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              {showHighlightsOnly ? 'Showing Highlights' : 'Filter Highlights'}
            </button>
          </div>

          {/* 3. List of Saved Sessions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                เซสชันที่บันทึกไว้ ({sessions.length})
              </span>
              {sessions.length > 0 && (
                <button
                  type="button"
                  onClick={handleWipeAll}
                  className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>ล้างข้อมูลทั้งหมด (Privacy Wipe)</span>
                </button>
              )}
            </div>

            {sessions.length > 0 ? (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {sessions
                  .filter(s => !showHighlightsOnly || s.questions.some(q => Math.max(q.confidence || 0, 96) === (q.confidence || 0)))
                  .map((s) => {
                    const hasHighlights = s.questions.some(q => Math.max(q.confidence || 0, 96) === (q.confidence || 0));
                    return (
                      <div
                        key={s.id}
                        className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-200 truncate">{s.title}</h4>
                            {hasHighlights && (
                              <span className="px-1.5 py-0.5 rounded-full bg-amber-950/50 text-[10px] text-amber-400 border border-amber-500/30">
                                ⭐ Highlight
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                            <span>{new Date(s.createdAt).toLocaleDateString()} {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <span>•</span>
                            <span>{s.questions.length} คำถาม</span>
                            <span>•</span>
                            <span className="text-emerald-400">{s.context.role}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onRestoreSession(s);
                              onClose();
                            }}
                            className="p-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/30 text-xs transition-colors"
                            title="เปิดเซสชันนี้กลับมาใช้งาน"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportJson(s)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                            title="ส่งออกเซสชันนี้เป็น JSON"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSession(s.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 transition-colors"
                            title="ลบเซสชันนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

              </div>
            ) : (
              <div className="p-6 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                ยังไม่มีเซสชันที่บันทึกไว้ คลิกปุ่ม "บันทึกเซสชัน" ด้านบนเพื่อจัดเก็บข้อมูล
              </div>
            )}
          </div>

          {feedbackMsg && (
            <p className="text-xs font-mono text-cyan-300 p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/30 flex items-center gap-1.5">
              {feedbackMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
