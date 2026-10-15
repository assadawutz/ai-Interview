import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Copy,
  Volume2,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Sparkles,
  Quote,
  Cpu,
  HelpCircle,
  CheckCircle2,
  Share2,
  ExternalLink,
  VolumeX,
} from 'lucide-react';
import { SmartAnswer, TechPronunciation } from '../types/interview';

interface SmartAnswerCardProps {
  answer: SmartAnswer;
  onPlayTTS: (text: string) => void;
  isLoadingAudio?: boolean;
  autoSpeak: boolean;
  onToggleAutoSpeak: () => void;
  onRegenerate?: (tone: string) => void;
}

export const SmartAnswerCard: React.FC<SmartAnswerCardProps> = ({
  answer,
  onPlayTTS,
  isLoadingAudio = false,
  autoSpeak,
  onToggleAutoSpeak,
  onRegenerate,
}) => {
  const [copied, setCopied] = useState(false);
  const [selectedTone, setSelectedTone] = useState('balanced');
  const [activeTab, setActiveTab] = useState<'summary' | 'full'>('summary');

  const handleCopyAll = () => {
    const fullText = `[คำถามสัมภาษณ์] ${answer.question}
ระดับความเสี่ยง: ${answer.riskLevel} - ${answer.riskSummary}

1. คำตอบที่ถูกต้อง:
${answer.directAnswer}

ตัวอย่างคำพูดจริง (Example Spoken Script):
${answer.exampleScript || 'พูดเปิดประเด็นสั้นตรงจุดตามข้อ 1'}

2. รูปแบบการทำงาน & กรอบความคิด (Mental Model):
${answer.howItWorks || 'สอดรับกับหลักการและ JD'}

3. ปัญหาที่พบบ่อย & ข้อผิดพลาด:
${answer.commonPitfalls || 'หลีกเลี่ยงการตอบกว้างเกินไป'}

4. ทางแก้ไข & ทางออก:
${answer.solutions || 'เสนอแนวทางที่วัดผลได้'}

5. คำอ่านศัพท์เทคนิค:
${answer.pronunciations.map((p) => `${p.thai} : ${p.note || ''}`).join('\n')}`;

    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const speakTerm = (term: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(term);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  };

  const riskLevel = answer.riskLevel || 'MEDIUM';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden"
    >
      {/* 1. Locked Status & Risk Level Banner */}
      <div
        className={`px-4 sm:px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 text-xs ${
          riskLevel === 'HIGH'
            ? 'bg-rose-50 border-rose-100 text-rose-800'
            : riskLevel === 'MEDIUM'
            ? 'bg-amber-50 border-amber-100 text-amber-800'
            : 'bg-emerald-50 border-emerald-100 text-emerald-800'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] font-mono font-semibold text-cyan-700">
            <Lock className="w-3 h-3 text-cyan-600" />
            LOCKED REPORT
          </span>

          <div className="flex items-center gap-1.5 font-bold tracking-wide">
            {riskLevel === 'HIGH' ? (
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            ) : riskLevel === 'MEDIUM' ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>[{riskLevel} RISK]</span>
          </div>

          <span className="opacity-90 truncate max-w-[200px] sm:max-w-md hidden xs:inline">
            {answer.riskSummary}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggleAutoSpeak}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs transition font-medium ${
              autoSpeak
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 shadow-sm'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
            }`}
            title={autoSpeak ? 'Auto-Speak (อ่านคำตอบอัตโนมัติทันทีเมื่อ Locked): เปิด' : 'Auto-Speak: ปิด'}
          >
            <Volume2 className={`w-3.5 h-3.5 ${autoSpeak ? 'text-emerald-600 animate-pulse' : 'text-slate-500'}`} />
            <span className="hidden sm:inline">Auto-Speak: {autoSpeak ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => onPlayTTS(`${answer.directAnswer}. ${answer.exampleScript || ''}`)}
            disabled={isLoadingAudio}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 active:scale-95 text-xs text-slate-700 transition font-medium border border-slate-200"
            title="ฟังเสียงอ่าน AI TTS"
          >
            {isLoadingAudio ? (
              <span className="animate-spin text-cyan-700">◌</span>
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-cyan-700" />
            )}
            <span className="hidden sm:inline">ฟังเสียงอ่าน</span>
          </button>

          <button
            onClick={handleCopyAll}
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 active:scale-95 text-xs text-slate-700 transition font-medium border border-slate-200"
            title="คัดลอกบทวิเคราะห์ทั้งหมด"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">คัดลอกแล้ว</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>คัดลอกทั้งหมด</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Detected Question & Unified Master Answer Header */}
      <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-cyan-50 border border-cyan-100 text-cyan-700 font-mono text-[11px]">
              คำถามและผลวิเคราะห์รวมเป็นอันเดียวกัน (Master Interview Brief)
            </span>
            <span>{new Date(answer.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
          <span className="font-mono text-[11px] text-slate-400">
            {answer.modelUsed} · Confidence {answer.confidence || 95}%
          </span>
        </div>
        <h2 className="text-lg sm:text-xl font-bold text-slate-950 tracking-tight leading-snug">
          "{answer.question}"
        </h2>
        
        {/* Confidence Meter */}
        <div className="mt-3 space-y-1">
          <div className="flex justify-between items-center text-[10px] font-mono text-slate-500">
            <span>Confidence Safety Score</span>
            <span>{answer.confidence || 95}%</span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${answer.confidence || 95}%` }}
            />
          </div>
        </div>

        {answer.riskSummary && (
          <p className="mt-3 text-xs sm:text-sm text-amber-800 flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <span><strong>กับดักคำถาม (Red Flag):</strong> {answer.riskSummary}</span>
          </p>
        )}
      </div>

      {/* 3. Core Intelligence Content Area with Sequential Reveal Animations */}
      <div className="p-4 sm:p-6 space-y-6">
        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setActiveTab('summary')}
            className={`flex-1 px-3 py-2 text-xs font-bold rounded-md transition ${activeTab === 'summary' ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Executive Summary
          </button>
          <button
            onClick={() => setActiveTab('full')}
            className={`flex-1 px-3 py-2 text-xs font-bold rounded-md transition ${activeTab === 'full' ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Full Breakdown
          </button>
        </div>

        {activeTab === 'summary' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-slate-900 border border-slate-700 p-6 text-white"
          >
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2">Executive Takeaway</h3>
            <p className="text-lg font-medium leading-relaxed">"{answer.executiveSummary || 'กำลังสรุปประเด็นสำคัญ...'}"</p>
          </motion.div>
        )}

        {activeTab === 'full' && (
          <div className="space-y-6">
        {/* PILLAR 1: คำตอบที่ถูกต้อง (The Right Answer) & ตัวอย่างคำพูดจริง */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="rounded-xl bg-amber-50 border border-amber-200 p-4 sm:p-5 relative overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wider">
                เสาหลักที่ 1: คำตอบที่ถูกต้อง (10 วินาทีแรก)
              </h3>
            </div>
            <span className="text-[11px] font-mono text-amber-800 px-2 py-0.5 rounded bg-amber-100 border border-amber-200">
              DIRECT PUNCHLINE
            </span>
          </div>

          {/* Direct 1-2 sentence Answer */}
          <p className="text-base sm:text-lg text-slate-900 font-medium leading-relaxed mb-4">
            {answer.directAnswer || 'กำลังประมวลผลคำตอบตรงจุด...'}
          </p>

          {/* Verbatim Spoken Script / Example */}
          {answer.exampleScript && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="rounded-lg bg-white border border-amber-200 p-4 mt-3"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 mb-2">
                <Quote className="w-4 h-4 text-amber-700" />
                <span>ตัวอย่างคำพูดจริง (Spoken Script พูดตามได้ทันที):</span>
              </div>
              <blockquote className="text-sm sm:text-base text-slate-700 italic leading-relaxed whitespace-pre-line pl-2 border-l-2 border-amber-300">
                "{answer.exampleScript}"
              </blockquote>
            </motion.div>
          )}
        </motion.div>

        {/* PILLAR 2: รูปแบบการทำงาน & กรอบความคิด (How It Works & Mental Model) */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="rounded-xl bg-indigo-50 border border-indigo-200 p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-700" />
              <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wider">
                เสาหลักที่ 2: รูปแบบการทำงาน & สิ่งที่ผู้สัมภาษณ์กำลังวัดผล
              </h3>
            </div>
            <span className="text-[11px] font-mono text-indigo-800 px-2 py-0.5 rounded bg-indigo-100 border border-indigo-200">
              EVALUATION RUBRIC
            </span>
          </div>

          <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line space-y-2">
            {answer.howItWorks || 'กำลังวิเคราะห์รูปแบบการทำงานและเกณฑ์วัดผล...'}
          </div>
        </motion.div>

        {/* PILLAR 3: ปัญหาที่พบบ่อย & กับดักคำถาม (Common Pitfalls) */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="rounded-xl bg-rose-50 border border-rose-200 p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-700" />
              <h3 className="text-sm font-bold text-rose-900 uppercase tracking-wider">
                เสาหลักที่ 3: ปัญหาที่พบบ่อย & ข้อผิดพลาดที่ทำให้ตกสัมภาษณ์
              </h3>
            </div>
            <span className="text-[11px] font-mono text-rose-800 px-2 py-0.5 rounded bg-rose-100 border border-rose-200">
              RED FLAGS TO AVOID
            </span>
          </div>

          <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line space-y-2">
            {answer.commonPitfalls || 'หลีกเลี่ยงการตอบคลุมเครือ ไม่มีหลักฐาน หรือกล่าวโทษผู้อื่น'}
          </div>
        </motion.div>

        {/* PILLAR 4: ทางแก้ไข & ทางออก (Solutions & Recovery) */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.45 }}
          className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-wider">
                เสาหลักที่ 4: ทางแก้ไข วิธีเอาตัวรอด และทางออกเชิงกลยุทธ์
              </h3>
            </div>
            <span className="text-[11px] font-mono text-emerald-800 px-2 py-0.5 rounded bg-emerald-100 border border-emerald-200">
              ACTIONABLE RECOVERY
            </span>
          </div>

          <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line space-y-2">
            {answer.solutions || 'หากไม่แน่ใจ ให้ทวนคำถามเพื่อจัดระเบียบความคิด และเสนอทางเลือก Option A vs Option B'}
          </div>
        </motion.div>

        {/* PILLAR 5: คำอ่านศัพท์เทคนิค (Phonetic Pronunciation Guide in Thai) */}
        {answer.pronunciations && answer.pronunciations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.55 }}
            className="rounded-xl bg-slate-50 border border-cyan-100 p-4 sm:p-5"
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-cyan-700" />
                <h3 className="text-sm font-bold text-cyan-900 uppercase tracking-wider">
                  คำอ่านศัพท์เทคนิคภาษาไทย (Pronunciation Guide)
                </h3>
              </div>
              <span className="text-[11px] text-slate-500">คลิกที่ลำโพงเพื่อฟังเสียงภาษาอังกฤษ</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {answer.pronunciations.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-cyan-200 transition group"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-cyan-800 text-sm truncate">
                      {item.thai}
                    </div>
                    {item.note && (
                      <div className="text-xs text-slate-500 truncate">
                        {item.note}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => speakTerm(item.term)}
                    className="p-1.5 rounded-md bg-slate-50 hover:bg-cyan-100 text-slate-500 hover:text-cyan-800 transition shrink-0"
                    title={`ฟังเสียงคำว่า ${item.term}`}
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    )}
  </div>

      {/* 4. Footer with locked verification seal */}
      <div className="px-4 sm:px-6 py-3 border-t border-slate-100 bg-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-slate-600 font-mono">
            FULL POLISH LOCKED RECORD #{answer.id.slice(-4)}
          </span>
        </div>
        <span className="font-mono text-[11px]">
          Session Context: Active
        </span>
      </div>
    </motion.div>
  );
};

