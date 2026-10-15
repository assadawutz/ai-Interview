import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  CheckCircle2,
  Trash2,
  Lock,
  Play,
  Volume2,
  Sparkles,
  Zap,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  FileText,
  Lightbulb,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { QueuedQuestion, SmartAnswer } from '../types/interview';

interface QuestionQueueProps {
  questions: QueuedQuestion[];
  answers: SmartAnswer[];
  activeQuestionId: string | null;
  onSelectQuestion: (question: QueuedQuestion) => void;
  onDismissQuestion: (id: string) => void;
  onClearQueue: () => void;
  minConfidence: number;
  onChangeMinConfidence?: (conf: number) => void;
  onPlayTTS: (text: string) => void;
  autoSpeak: boolean;
  onRegenerate: (question: QueuedQuestion, tone: string) => void;
}

export const QuestionQueue: React.FC<QuestionQueueProps> = ({
  questions,
  answers,
  activeQuestionId,
  onSelectQuestion,
  onDismissQuestion,
  onClearQueue,
  minConfidence,
  onChangeMinConfidence,
  onPlayTTS,
  autoSpeak,
  onRegenerate,
}) => {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [selectedTones, setSelectedTones] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getConfidenceBadge = (rawConfidence?: number) => {
    let conf = 85;
    if (typeof rawConfidence === 'number') {
      conf = rawConfidence <= 1 ? Math.round(rawConfidence * 100) : Math.round(rawConfidence);
    }

    if (conf >= 80) {
      return {
        score: conf,
        textColor: 'text-emerald-400',
        bgColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        strokeColor: '#34d399',
      };
    } else if (conf >= 60) {
      return {
        score: conf,
        textColor: 'text-amber-400',
        bgColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        strokeColor: '#fbbf24',
      };
    } else {
      return {
        score: conf,
        textColor: 'text-rose-400',
        bgColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        strokeColor: '#f43f5e',
      };
    }
  };

  useEffect(() => {
    if (isAutoScrollEnabled && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [questions.length]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop <= clientHeight + 50; 
      setIsAutoScrollEnabled(isAtBottom);
    }
  };

  return (
    <div className="flex flex-col h-full rounded-2xl bg-white border border-slate-200 p-4 sm:p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-700">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-950 tracking-tight">
              คิวคำถามและผลวิเคราะห์อัจฉริยะ (Live Feed)
            </h3>
            <p className="text-[11px] text-slate-500">
              แสดงคำถามและบทพูดตอบ (Smart Answer) แบบเรียลไทม์ในที่เดียว ({questions.length})
            </p>
          </div>
        </div>

        {questions.length > 0 && (
          <button
            onClick={onClearQueue}
            className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 text-xs font-semibold transition flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>ล้างทั้งหมด</span>
          </button>
        )}
      </div>

      {/* Min Confidence Sensitivity Filter */}
      <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs flex items-center justify-between gap-3">
        <span className="text-slate-600 font-mono text-[11px] flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-600" />
          Confidence Threshold ≥ <strong className="text-cyan-700">{minConfidence}%</strong>
        </span>
        <div className="flex items-center gap-1">
          {[40, 60, 75, 85].map((thresh) => (
            <button
              key={thresh}
              onClick={() => onChangeMinConfidence && onChangeMinConfidence(thresh)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition ${
                minConfidence === thresh
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'bg-white text-slate-500 hover:text-slate-900 border border-slate-200'
              }`}
            >
              {thresh}%
            </button>
          ))}
        </div>
      </div>

      {/* Questions & Unified Answers Feed */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto space-y-4 pr-1 no-scrollbar">
        {questions.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 min-h-[350px]">
            <div className="w-14 h-14 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-700 mb-4 animate-pulse">
              <Sparkles className="w-7 h-7" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">ยังไม่มีคำถามในคิวเรียลไทม์</h4>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-4">
              เปิดไมค์เพื่อดักฟังคำถามจากผู้สัมภาษณ์ หรือพิมพ์คำถามทดสอบด้านบน ระบบจะวิเคราะห์และสร้างบทพูดตอบทันที
            </p>
          </div>
        ) : (
          questions.map((q, idx) => {
            const confVal = typeof q.confidence === 'number' ? (q.confidence <= 1 ? Math.round(q.confidence * 100) : Math.round(q.confidence)) : 85;
            const isLowConfidence = confVal < minConfidence;
            const conf = getConfidenceBadge(q.confidence);
            const associatedAnswer = answers.find(
              (a) => a.questionId === q.id || a.question.trim().toLowerCase() === q.text.trim().toLowerCase()
            );
            const isExpanded = expandedIds[q.id] !== false; // default expanded

            return (
              <div
                key={q.id}
                className={`rounded-2xl border transition-all overflow-hidden ${
                  q.status === 'active'
                    ? 'bg-cyan-50 border-cyan-200 shadow-sm'
                    : isLowConfidence 
                      ? 'bg-rose-50 border-rose-200' 
                      : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Question Header Bar */}
                <div
                  onClick={() => {
                    onSelectQuestion(q);
                    toggleExpand(q.id);
                  }}
                  className="p-4 cursor-pointer flex items-start justify-between gap-3 bg-white border-b border-slate-100"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="font-mono text-xs font-bold text-cyan-700 shrink-0 mt-0.5">
                      #{String(questions.length - idx).padStart(2, '0')}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {isLowConfidence && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 border border-rose-200 text-rose-800">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                LOW CONFIDENCE
                            </span>
                        )}
                        {q.status === 'answered' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 border border-emerald-200 text-emerald-800">
                            <Lock className="w-2.5 h-2.5" />
                            LOCKED & POLISHED
                          </span>
                        ) : q.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-100 border border-cyan-200 text-cyan-800 animate-pulse">
                            <Zap className="w-2.5 h-2.5" />
                            ANALYZING...
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600">
                            <Clock className="w-2.5 h-2.5" />
                            QUEUED
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500 font-mono capitalize">
                          {q.category || 'General'}
                        </span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-950 leading-relaxed">
                        {q.text}
                      </h4>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {/* Verify Source Button */}
                    {isLowConfidence && (
                      <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelectQuestion(q);
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold shadow-sm"
                      >
                        <Search className="w-3 h-3"/>
                        Verify Source
                      </button>
                    )}
                    {/* Circular Confidence Gauge */}
                    <div className="flex items-center gap-1" title={`Confidence: ${conf.score}%`}>
                      <div className="relative w-8 h-8 flex items-center justify-center">
                        <svg className="w-8 h-8 transform -rotate-90" viewBox="0 0 36 36">
                          <path
                            className="text-slate-200"
                            strokeWidth="3.5"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                          <path
                            stroke={conf.strokeColor}
                            strokeWidth="3.5"
                            strokeDasharray="100"
                            strokeDashoffset={100 - conf.score}
                            strokeLinecap="round"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                        </svg>
                        <span className={`absolute text-[10px] font-mono font-bold ${conf.textColor}`}>
                          {conf.score}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDismissQuestion(q.id);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      title="ลบคำถาม"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <div className="text-slate-500">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* Inline Unified Smart Answer Section */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {associatedAnswer ? (
                      <div className="space-y-4">
                        {/* Risk & Model Header */}
                        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg font-mono font-bold bg-amber-50 border border-amber-200 text-amber-800 text-[11px]">
                              Risk: {associatedAnswer.riskLevel}
                            </span>
                            <span className="text-slate-500 text-[11px] line-clamp-1">
                              {associatedAnswer.riskSummary}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedTones[q.id] || 'balanced'}
                              onChange={(e) => setSelectedTones(prev => ({ ...prev, [q.id]: e.target.value }))}
                              className="px-2 py-1 rounded bg-white border border-slate-300 text-xs text-slate-700"
                            >
                              <option value="balanced">Balanced</option>
                              <option value="Assertive">Assertive</option>
                              <option value="Consultative">Consultative</option>
                              <option value="Concise">Concise</option>
                            </select>
                            <button
                              onClick={() => onRegenerate(q, selectedTones[q.id] || 'balanced')}
                              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow-sm"
                            >
                              Regenerate
                            </button>
                            {associatedAnswer.directAnswer && (
                              <button
                                onClick={() =>
                                  onPlayTTS(
                                    `${associatedAnswer.directAnswer}. ${associatedAnswer.exampleScript || ''}`
                                  )
                                }
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                                <span>ฟังเสียงพูด (TTS)</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* PILLAR 1: Punchline & Spoken Script */}
                        <div className="p-4 rounded-xl bg-slate-50 border border-cyan-200 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-cyan-800 font-bold text-xs flex items-center gap-1.5 uppercase tracking-wide">
                              <Sparkles className="w-3.5 h-3.5" />
                              1. คำตอบตรงจุด (Direct Punchline & Spoken Script)
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm font-semibold text-slate-900 leading-relaxed">
                            "{associatedAnswer.directAnswer || 'กำลังประมวลผลคำตอบ...'}"
                          </p>
                          {associatedAnswer.exampleScript && (
                            <div className="p-3 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-mono leading-relaxed">
                              <span className="text-cyan-800 text-[10px] uppercase font-bold block mb-1">
                                บทพูดจริง (Verbatim Script):
                              </span>
                              {associatedAnswer.exampleScript}
                            </div>
                          )}
                        </div>

                        {/* PILLAR 2: How It Works & STAR Framework */}
                        {associatedAnswer.howItWorks && (
                          <div className="p-3.5 rounded-xl bg-slate-50 border border-indigo-200 space-y-1.5">
                            <span className="text-indigo-800 font-bold text-xs flex items-center gap-1.5 uppercase tracking-wide">
                              <FileText className="w-3.5 h-3.5" />
                              2. กรอบความคิด & เกณฑ์วัดผล (STAR Framework)
                            </span>
                            <p className="text-xs text-slate-700 leading-relaxed">
                              {associatedAnswer.howItWorks}
                            </p>
                          </div>
                        )}

                        {/* PILLAR 3 & 4: Pitfalls & Solutions */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {associatedAnswer.commonPitfalls && (
                            <div className="p-3.5 rounded-xl bg-slate-50 border border-rose-200 space-y-1.5">
                              <span className="text-rose-800 font-bold text-xs flex items-center gap-1.5 uppercase tracking-wide">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                3. ข้อควรระวัง (Pitfalls)
                              </span>
                              <p className="text-[11px] text-slate-700 leading-relaxed">
                                {associatedAnswer.commonPitfalls}
                              </p>
                            </div>
                          )}

                          {associatedAnswer.solutions && (
                            <div className="p-3.5 rounded-xl bg-slate-50 border border-emerald-200 space-y-1.5">
                              <span className="text-emerald-800 font-bold text-xs flex items-center gap-1.5 uppercase tracking-wide">
                                <Lightbulb className="w-3.5 h-3.5" />
                                4. ทางออก & เทคนิคพลิกเกม
                              </span>
                              <p className="text-[11px] text-slate-700 leading-relaxed">
                                {associatedAnswer.solutions}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 text-center space-y-3">
                        <p className="text-xs text-slate-500">ยังไม่ได้สร้างบทวิเคราะห์ Full Polish สำหรับคำถามนี้</p>
                        <button
                          onClick={() => onSelectQuestion(q)}
                          className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition shadow-sm"
                        >
                          คลิกเพื่อวิเคราะห์คำตอบทันที ⚡
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
