import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Sparkles,
  Award,
  Globe,
  Linkedin,
  Paperclip,
  Radio,
  FileText,
  Volume2,
  Lock,
  Layers,
  ChevronRight,
  HelpCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Share2,
} from 'lucide-react';
import { Navbar } from './components/Navbar';
import { SmartAnswerCard } from './components/SmartAnswerCard';
import { QuestionQueue } from './components/QuestionQueue';
import { ContextModal } from './components/ContextModal';
import { SessionManagerModal } from './components/SessionManagerModal';
import { UniversalInputBar } from './components/UniversalInputBar';
import { AudioWaveIndicator } from './components/AudioWaveIndicator';
import { AntiStressOverlay } from './components/AntiStressOverlay';
import { DashboardWidget } from './components/DashboardWidget';
import { ConfidenceDistributionWidget } from './components/ConfidenceDistributionWidget';
import { generateInterviewReport } from './utils/pdfGenerator';
import {
  AiThinkingSpeed,
  CandidateContext,
  InterviewMode,
  InterviewSession,
  QueuedQuestion,
  SmartAnswer,
} from './types/interview';
import { parseStreamedAnswer, isDuplicateQuestion } from './utils/answerParser';
import { audioService } from './utils/audioService';

const DEFAULT_CONTEXT: CandidateContext = {
  role: 'Senior Full Stack Engineer',
  targetCompany: 'Tech Innovators Co.',
  companyWebsiteUrl: 'https://example.com/careers',
  companyLinkedInUrl: 'https://linkedin.com/company/tech-innovators',
  resume: 'ประสบการณ์ 5+ ปีด้าน TypeScript, React, Node.js, Cloud Architecture และ Distributed Systems มีผลงานพัฒนา High-throughput microservices',
  jd: 'ต้องการ Senior Full Stack Engineer ที่มีความเป็นผู้นำ ออกแบบ Scalable Architecture ได้ เข้าใจ CI/CD, Microservices, Clean Architecture และทำงานแบบ Agile',
  jdFileName: 'Senior-Engineer-JD.pdf',
  coverLetter: 'มุ่งมั่นสร้างนวัตกรรมที่มีผลกระทบสูง แก้ปัญหาซับซ้อน และผลักดันทีมไปข้างหน้า',
};

export default function App() {
  // App Modes and Options
  const [mode, setMode] = useState<InterviewMode>('live');
  const [speed, setSpeed] = useState<AiThinkingSpeed>('balanced');
  const [useSearch, setUseSearch] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [minConfidence, setMinConfidence] = useState(60);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [isSessionManagerOpen, setIsSessionManagerOpen] = useState(false);
  const [autoExpireHours, setAutoExpireHours] = useState<number>(24);
  const [isQuickStudy, setIsQuickStudy] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isAntiStressOpen, setIsAntiStressOpen] = useState(false);

  // Responsive Mobile Tab: 'queue' | 'analysis' | 'context'
  const [mobileTab, setMobileTab] = useState<'queue' | 'analysis' | 'context'>('queue');

  // Audio and Speech State
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');

  // Interview Questions and Answers
  const [context, setContext] = useState<CandidateContext>(DEFAULT_CONTEXT);
  const [questions, setQuestions] = useState<QueuedQuestion[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<QueuedQuestion | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState<SmartAnswer | null>(null);
  const [allAnswers, setAllAnswers] = useState<SmartAnswer[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // Abort controller for streaming
  const abortControllerRef = useRef<AbortController | null>(null);

  // Audio Service Volume & Speech Callback
  const handleVolumeChange = useCallback((vol: number) => {
    setAudioLevel(vol);
  }, []);

  // Trigger analysis of a question with full-polish locking
  const triggerAnalyzeQuestion = async (q: QueuedQuestion, tone?: string) => {
    // If we already have a locked answer for this question, display it immediately
    const existing = allAnswers.find((a) => a.question.trim().toLowerCase() === q.text.trim().toLowerCase());
    if (existing && !isAnalyzing) {
      setActiveQuestion(q);
      setCurrentAnswer({ ...existing, isLocked: true });
      setMobileTab('analysis');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsAnalyzing(true);
    setActiveQuestion(q);
    setMobileTab('analysis'); // Auto switch to analysis tab on mobile

    // Update status to active
    setQuestions((prev) =>
      prev.map((item) => (item.id === q.id ? { ...item, status: 'active' } : item))
    );

    const baseAnswer: SmartAnswer = {
      id: `ans_${Date.now()}`,
      questionId: q.id,
      question: q.text,
      timestamp: Date.now(),
      riskLevel: 'MEDIUM',
      riskSummary: 'กำลังประเมินระดับความเสี่ยงของคำถาม...',
      directAnswer: '',
      exampleScript: '',
      howItWorks: '',
      commonPitfalls: '',
      solutions: '',
      pronunciations: [],
      rawMarkdown: '',
      isStreaming: true,
      isLocked: false,
      confidence: q.confidence || 95,
      category: q.category,
      modelUsed:
        speed === 'fast'
          ? 'gemini-3.1-flash-lite'
          : speed === 'deep'
          ? 'gemini-4-argon'
          : 'gemini-3.8-flash',
      webSources: [],
    };
    setCurrentAnswer(baseAnswer);

    try {
      const response = await fetch('/api/analyze-question-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          question: q.text,
          context: {
            role: context.role,
            targetCompany: context.targetCompany,
            companyWebsiteUrl: context.companyWebsiteUrl,
            companyLinkedInUrl: context.companyLinkedInUrl,
            resume: context.resume,
            jd: context.jd,
            coverLetter: context.coverLetter,
            pastQAs: allAnswers.slice(0, 3).map((a) => ({
              question: a.question,
              directAnswer: a.directAnswer,
            })),
          },
          mode: speed,
          useSearch,
          isQuickStudy,
          tone: tone || 'balanced',
        }),
      });

      if (!response.body) {
        throw new Error('ReadableStream not supported.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedMarkdown = '';
      let sseBuffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const parts = sseBuffer.split('\n\n');
        sseBuffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('data: ')) {
              const dataStr = trimmedLine.slice(6).trim();
              if (!dataStr) continue;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.text) {
                  accumulatedMarkdown += parsed.text;
                  const updated = parseStreamedAnswer(accumulatedMarkdown, {
                    ...baseAnswer,
                    isStreaming: true,
                    isLocked: false,
                  });
                  setCurrentAnswer(updated);
                }
              } catch (e) {
                // Ignore parse errors on partial chunks
              }
            }
          }
        }
      }

      // Final lock guarantee after loop ends
      if (accumulatedMarkdown.trim()) {
        const finalAnswer = parseStreamedAnswer(accumulatedMarkdown, {
          ...baseAnswer,
          isStreaming: false,
          isLocked: true, // FULL POLISH LOCKED
        });
        setCurrentAnswer(finalAnswer);

        // Lock into allAnswers
        setAllAnswers((prev) => {
          const filtered = prev.filter((a) => a.question !== finalAnswer.question);
          return [finalAnswer, ...filtered];
        });

        if ((autoSpeak || ttsEnabled) && finalAnswer.directAnswer) {
          playTTS(`${finalAnswer.directAnswer}. ${finalAnswer.exampleScript || ''}`);
        }
      }

      // Mark question as answered/locked
      setQuestions((prev) =>
        prev.map((item) =>
          item.id === q.id ? { ...item, status: 'answered', isLocked: true } : item
        )
      );
      
      // Simulate high stress detection (e.g. if confidence is low)
      if ((q.confidence || 95) < 60) {
        setIsAntiStressOpen(true);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Stream error:', err);
      }
    } finally {
      setIsAnalyzing(false);
      abortControllerRef.current = null;
    }
  };

  const handleSpeechTranscript = useCallback(
    async (transcript: string, isFinal: boolean) => {
      setLiveTranscript(transcript);
      if (!isFinal) return;

      // Only auto-detect questions in Live Mode
      if (mode !== 'live') return;

      try {
        const existingTexts = questions.map((q) => q.text);
        const res = await fetch('/api/detect-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript,
            existingQuestions: existingTexts,
          }),
        });

        const data = await res.json();
        if (data.isQuestion && data.cleanQuestion) {
          const isDup =
            data.isDuplicate ||
            existingTexts.some((txt) => isDuplicateQuestion(txt, data.cleanQuestion));

          if (!isDup) {
            const newQ: QueuedQuestion = {
              id: `q_${Date.now()}`,
              text: data.cleanQuestion,
              detectedAt: Date.now(),
              status: 'queued',
              category: data.category,
              confidence: typeof data.confidence === 'number' ? data.confidence : 92,
              intent: data.intent,
            };

            setQuestions((prev) => [newQ, ...prev]);

            // Trigger immediate analysis if not currently streaming
            if (!isAnalyzing) {
              triggerAnalyzeQuestion(newQ);
            }
          }
        }
      } catch (err) {
        console.error('Question detection error:', err);
      }
    },
    [mode, questions, isAnalyzing, allAnswers, speed, useSearch, context]
  );

  // Microphone toggle handler
  const handleToggleMic = async () => {
    if (isListening) {
      audioService.stop();
      setIsListening(false);
      setAudioLevel(0);
      setLiveTranscript('');
    } else {
      const ok = await audioService.startMicrophone(
        handleVolumeChange,
        handleSpeechTranscript
      );
      if (ok) {
        setIsListening(true);
      }
    }
  };

  const handleSubmitManualQuestion = (questionText: string) => {
    const newQ: QueuedQuestion = {
      id: `q_${Date.now()}`,
      text: questionText,
      detectedAt: Date.now(),
      status: 'queued',
      category: 'technical',
      confidence: 100,
    };

    setQuestions((prev) => [newQ, ...prev]);
    triggerAnalyzeQuestion(newQ);
  };

  const handleStopAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsAnalyzing(false);
    if (currentAnswer) {
      setCurrentAnswer({ ...currentAnswer, isStreaming: false, isLocked: true });
    }
  };

  const playTTS = async (text: string) => {
    if (!text) return;
    setIsLoadingAudio(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceName: 'Kore' }),
      });
      const data = await res.json();
      if (data.audio) {
        await audioService.playAudio(data.audio);
      } else {
        // Fallback to Web Speech API
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'th-TH';
          utterance.rate = 1.0;
          window.speechSynthesis.speak(utterance);
        }
      }
    } catch (e) {
      console.error('TTS error:', e);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handleExportSession = () => {
    const sessionData = {
      exportedAt: new Date().toISOString(),
      role: context.role,
      company: context.targetCompany,
      website: context.companyWebsiteUrl,
      linkedIn: context.companyLinkedInUrl,
      jdReferenced: context.jdFileName || 'text-content',
      questionsCount: questions.length,
      answersCount: allAnswers.length,
      questions,
      answers: allAnswers,
    };

    const blob = new Blob([JSON.stringify(sessionData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-pulse-${(context.targetCompany || 'session').toLowerCase()}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    generateInterviewReport(allAnswers);
  };

  const handleClearSession = () => {
    if (window.confirm('คุณต้องการล้างประวัติคำถามทั้งหมดในห้องสัมภาษณ์นี้หรือไม่?')) {
      handleStopAnalysis();
      setQuestions([]);
      setActiveQuestion(null);
      setCurrentAnswer(null);
      setAllAnswers([]);
    }
  };

  const handleRestoreSession = (restored: InterviewSession) => {
    handleStopAnalysis();
    if (restored.context) setContext(restored.context);
    if (restored.questions) setQuestions(restored.questions);
    if (restored.answers) {
      setAllAnswers(restored.answers);
      if (restored.answers.length > 0) {
        setCurrentAnswer(restored.answers[0]);
        setMobileTab('analysis');
      }
    }
  };

  // Cleanup on mount / unmount
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setIsFocusMode((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      audioService.stop();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 1. Global Navigation Bar */}
      {!isFocusMode && (
        <Navbar
          mode={mode}
          onToggleMode={setMode}
          speed={speed}
          onChangeSpeed={setSpeed}
          useSearch={useSearch}
          onToggleSearch={() => setUseSearch(!useSearch)}
          ttsEnabled={ttsEnabled}
          onToggleTts={() => setTtsEnabled(!ttsEnabled)}
          onOpenContext={() => setIsContextModalOpen(true)}
          onOpenSessionManager={() => setIsSessionManagerOpen(true)}
          onExportSession={handleExportSession}
          onExportPdf={handleExportPdf}
          onClearSession={handleClearSession}
          targetRole={context.role}
          targetCompany={context.targetCompany}
          isQuickStudy={isQuickStudy}
          onToggleQuickStudy={() => setIsQuickStudy(!isQuickStudy)}
        />
      )}

      {/* 2. Live Audio Listening Strip (Responsive) */}
      {!isFocusMode && (
        <div className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-sm px-4 sm:px-6 py-2.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Left: Interactive Mic Controller & Live Speech Wave */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={handleToggleMic}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-medium transition-all ${
                  isListening
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {isListening ? (
                  <>
                    <Mic className="w-4 h-4 animate-pulse" />
                    <span>กำลังดักฟังบทสนทนา</span>
                  </>
                ) : (
                  <>
                    <MicOff className="w-4 h-4 text-slate-400" />
                    <span>คลิกเพื่อเปิดไมค์ดักฟัง</span>
                  </>
                )}
              </button>

              {/* Audio Wave Indicator */}
              <AudioWaveIndicator
                isListening={isListening}
                audioLevel={audioLevel}
                isAnalyzing={isAnalyzing}
                className="hidden sm:flex"
              />

              {/* Live speech transcription subtitle */}
              {isListening && liveTranscript && (
                <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-black/40 border border-slate-800 text-slate-300 truncate max-w-md">
                  <span className="text-[10px] font-mono text-cyan-400 uppercase">Heard:</span>
                  <span className="truncate italic">"{liveTranscript}"</span>
                </div>
              )}
            </div>

            {/* Right: Quick Context summary & lock stats */}
            <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-cyan-400" />
                <span>ล็อคผลแล้ว {allAnswers.length} ข้อ</span>
              </span>
              <span className="hidden sm:inline text-slate-700">|</span>
              <span className="hidden sm:inline text-slate-400">
                {context.role} ({context.targetCompany})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Main Unified Live Feed Dashboard */}
      <main className={`flex-1 ${isFocusMode ? 'max-w-2xl' : 'max-w-4xl'} w-full mx-auto p-3 sm:p-6 flex flex-col space-y-5`}>
        {!isFocusMode && (
          <UniversalInputBar
            mode={mode}
            isListening={isListening}
            onToggleMic={handleToggleMic}
            onSubmitQuestion={handleSubmitManualQuestion}
            isAnalyzing={isAnalyzing}
            onStopAnalysis={handleStopAnalysis}
            onUploadFile={() => setIsContextModalOpen(true)}
            audioLevel={audioLevel}
          />
        )}

        {/* Unified Questions & Answers Live Feed */}
        <div className="flex-1 min-h-[600px]">
          <QuestionQueue
            questions={questions}
            answers={allAnswers}
            activeQuestionId={activeQuestion?.id || null}
            onSelectQuestion={triggerAnalyzeQuestion}
            onDismissQuestion={(id) => {
              setQuestions((prev) => prev.filter((q) => q.id !== id));
            }}
            onClearQueue={() => {
              setQuestions([]);
            }}
            minConfidence={minConfidence}
            onChangeMinConfidence={setMinConfidence}
            onPlayTTS={playTTS}
            autoSpeak={autoSpeak}
            onRegenerate={triggerAnalyzeQuestion}
          />
          
          {!isFocusMode && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
               <DashboardWidget questions={questions} />
               <ConfidenceDistributionWidget questions={questions} />
            </div>
          )}
        </div>
      </main>

      {/* Context Modal for uploading/editing JD, Resume & Company */}
      <ContextModal
        isOpen={isContextModalOpen}
        onClose={() => setIsContextModalOpen(false)}
        context={context}
        onSaveContext={(updated) => setContext(updated)}
      />

      {/* Session Manager Modal for Exporting JSON and Clearing Privacy */}
      <SessionManagerModal
        isOpen={isSessionManagerOpen}
        onClose={() => setIsSessionManagerOpen(false)}
        currentQuestions={questions}
        currentAnswers={allAnswers}
        currentContext={context}
        onRestoreSession={handleRestoreSession}
        onClearCurrentSession={handleClearSession}
        autoExpireHours={autoExpireHours}
        onChangeAutoExpire={setAutoExpireHours}
        minConfidence={minConfidence}
        onChangeMinConfidence={setMinConfidence}
        autoSpeak={autoSpeak}
        onToggleAutoSpeak={() => setAutoSpeak(!autoSpeak)}
      />
      <AntiStressOverlay isOpen={isAntiStressOpen} onClose={() => setIsAntiStressOpen(false)} />
    </div>
  );
}
