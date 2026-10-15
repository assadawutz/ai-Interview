import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  Focus,
  GraduationCap,
  Headphones,
  LayoutDashboard,
  LoaderCircle,
  Mic,
  Plus,
  Settings2,
  Target,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  VolumeX,
  X,
  Archive,
  WifiOff,
} from 'lucide-react';
import {
  defaultContext,
  defaultSettings,
  type Health,
  type InterviewSession,
  type PracticeTurn,
  type Settings,
  type SavedPreparation,
} from '../shared/contracts';
import {
  request,
  downloadJson,
  setAccessToken,
  setRequestTimeoutMs,
  clearGeminiKey,
} from './lib/api';
import {
  clearAll,
  DRAFT_KEY,
  LEGACY_KEY,
  loadDraft,
  loadSessions,
  migrateLegacy,
  saveSessions,
  writeDraft,
} from './lib/storage';
import { useInterview } from './hooks/useInterview';
import { useAudio } from './hooks/useAudio';
import { useSpeech } from './hooks/useSpeech';
import { AnswerCard } from './components/AnswerCard';
import { ProfilePanel } from './components/ProfilePanel';
import { SessionsPanel } from './components/SessionsPanel';
import { SystemPanel } from './components/SystemPanel';
import { PracticePanel } from './components/PracticePanel';
import { Copilot } from './components/Copilot';
import { PreparationPanel } from './components/PreparationPanel';
import { Modal } from './components/Modal';

type Tab = 'workspace' | 'practice' | 'profile' | 'sessions' | 'system' | 'preparation';
function readInitial() {
  try {
    const sessions = loadSessions(localStorage),
      draft = loadDraft(localStorage);
    try {
      const legacy = migrateLegacy(localStorage).filter(
        (old) => !sessions.some((s) => s.id === old.id),
      );
      if (legacy.length) {
        sessions.push(...legacy);
        saveSessions(localStorage, sessions);
      }
      localStorage.removeItem(LEGACY_KEY);
      return { draft, sessions, error: '' };
    } catch {
      return {
        draft,
        sessions,
        error:
          'Legacy sessions could not be migrated. Original data was preserved; autosave is paused.',
      };
    }
  } catch {
    return {
      draft: null,
      sessions: [],
      error:
        'Unable to read local sessions. Autosave is paused to protect existing data. Export or clear storage from Sessions.',
    };
  }
}
export default function App() {
  const [initial] = useState(readInitial);
  const [tab, setTab] = useState<Tab>('workspace');
  const [context, setContext] = useState(initial.draft?.context || defaultContext);
  const [settings, setSettings] = useState<Settings>({
    ...defaultSettings,
    ...initial.draft?.settings,
    autosave: initial.error ? false : (initial.draft?.settings?.autosave ?? true),
  });
  const [sessionInfo, setSessionInfo] = useState({
    id: initial.draft?.id || crypto.randomUUID(),
    createdAt: initial.draft?.createdAt || Date.now(),
    title: initial.draft?.title || '',
  });
  const [practice, setPractice] = useState<PracticeTurn[]>(initial.draft?.practice || []);
  const [practiceDraft, setPracticeDraft] = useState(
    initial.draft?.practiceDraft || { question: '', answer: '' },
  );
  const [preparation, setPreparation] = useState<SavedPreparation | undefined>(
    initial.draft?.preparation,
  );
  const [sessions, setSessions] = useState<InterviewSession[]>(initial.sessions);
  const [notice, setNotice] = useState(initial.error),
    [health, setHealth] = useState<Health | null>(null);
  const [input, setInput] = useState(''),
    [filter, setFilter] = useState(''),
    [focus, setFocus] = useState(false),
    [showAudio, setShowAudio] = useState(false),
    [showHelp, setShowHelp] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [offline, setOffline] = useState(!navigator.onLine);
  const [saveStatus, setSaveStatus] = useState(''),
    [now, setNow] = useState(Date.now());
  const language = settings.language;
  const t = (th: string, en: string) => (language === 'th' ? th : en);
  const notify = useCallback((message: string) => setNotice(message), []);
  const speech = useSpeech(language, notify);
  const interview = useInterview(context, settings, notify, (text) => {
    void speech.speak(text);
  });
  const audio = useAudio(settings, interview.add, interview.questions, notify);
  const currentTitle = (
    sessionInfo.title ||
    `${context.role || t('เตรียมสัมภาษณ์', 'Interview prep')}${context.targetCompany ? ` · ${context.targetCompany}` : ''}`
  ).slice(0, 250);
  const snapshot = useMemo<InterviewSession>(
    () => ({
      version: 3,
      ...sessionInfo,
      title: currentTitle,
      lastUpdated: Date.now(),
      autoExpireHours: settings.autoExpireHours,
      context,
      questions: interview.questions,
      answers: interview.answers,
      practice,
      practiceDraft,
      preparation,
      settings,
    }),
    [
      sessionInfo,
      currentTitle,
      settings,
      context,
      interview.questions,
      interview.answers,
      practice,
      practiceDraft,
      preparation,
    ],
  );
  const refreshHealth = useCallback(async () => {
    try {
      const status = await request<Health>('health');
      setHealth(status);
      setRequestTimeoutMs(status.requestTimeoutMs);
    } catch {
      setHealth(null);
      notify('Server unavailable. Check the server and network connection.');
    }
  }, [notify]);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    void refreshHealth();
    const interval = setInterval(() => {
      void refreshHealth();
    }, 60000);
    return () => clearInterval(interval);
  }, [refreshHealth]);
  useEffect(() => {
    if (initial.draft) {
      interview.restore(initial.draft.questions, initial.draft.answers);
      setSaveStatus('restored');
    }
    const online = () => setOffline(!navigator.onLine);
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    const keydown = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFocus((prev) => !prev);
      }
    };
    window.addEventListener('keydown', keydown);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
      window.removeEventListener('keydown', keydown);
      clearInterval(clock);
    };
  }, []);
  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;
  useEffect(() => {
    if (!settings.autosave) {
      setSaveStatus('off');
      return;
    }
    const timer = setTimeout(() => {
      try {
        writeDraft(localStorage, snapshot);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
        notify(
          t(
            'บันทึกอัตโนมัติไม่สำเร็จ พื้นที่เก็บข้อมูลอาจเต็ม กรุณาส่งออก JSON',
            'Autosave failed. Storage may be full. Export a JSON backup.',
          ),
        );
        setSettings((prev) => ({ ...prev, autosave: false }));
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [snapshot, settings.autosave]);
  useEffect(() => {
    const save = () => {
      if (latestSnapshot.current.settings?.autosave) {
        try {
          writeDraft(localStorage, latestSnapshot.current);
        } catch {
          /* UI already exposes storage failures. */
        }
      }
    };
    window.addEventListener('pagehide', save);
    const purge = setInterval(() => {
      try {
        const remaining = loadSessions(localStorage);
        setSessions((prev) => (remaining.length === prev.length ? prev : remaining));
        loadDraft(localStorage);
      } catch {
        notify('Unable to clean expired sessions. Check browser storage.');
      }
    }, 60000);
    return () => {
      window.removeEventListener('pagehide', save);
      clearInterval(purge);
    };
  }, [notify]);
  useEffect(() => {
    if (tab !== 'workspace') audio.stop();
  }, [tab]);
  const updateSettings = (updated: Settings) => {
    setSettings(updated);
    if (!updated.autosave && settings.autosave) {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        notify('Unable to remove recovery draft.');
      }
    }
    if (!updated.autoSpeak) speech.stop();
  };
  const restore = (session: InterviewSession) => {
    if (
      (interview.questions.length || practice.length || practiceDraft.answer) &&
      !window.confirm(
        t(
          'การเปิดเซสชันจะแทนที่งานปัจจุบัน บันทึกหรือส่งออกไว้แล้วหรือไม่?',
          'Restoring replaces the current workspace. Save or export first. Continue?',
        ),
      )
    )
      return false;
    audio.stop();
    audio.clearTranscript();
    speech.stop();
    interview.restore(session.questions, session.answers);
    setContext(session.context);
    setPractice(session.practice);
    setPracticeDraft(session.practiceDraft);
    setPreparation(session.preparation);
    if (session.settings) updateSettings(session.settings);
    setSessionInfo({ id: session.id, title: session.title, createdAt: session.createdAt });
    setTab('workspace');
    setNotice(t('เปิดเซสชันแล้ว', 'Session restored.'));
    return true;
  };
  const saveLibrary = (updated: InterviewSession[]) => {
    try {
      saveSessions(localStorage, updated);
      setSessions(updated);
      return true;
    } catch {
      notify(
        t(
          'บันทึกไม่ได้ กรุณาส่งออก JSON เพื่อสำรองข้อมูล',
          'Storage unavailable. Export JSON to back up your session.',
        ),
      );
      return false;
    }
  };
  const reset = (wipe = false) => {
    if (
      !window.confirm(
        wipe
          ? t(
              'ล้างข้อมูลทั้งหมดในเบราว์เซอร์นี้? การลบไม่สามารถย้อนกลับได้',
              'Clear all local data? This cannot be undone.',
            )
          : t(
              'เริ่มเซสชันใหม่? บันทึกหรือส่งออกข้อมูลปัจจุบันก่อนดำเนินการ',
              'Start a new session? Save or export the current session first.',
            ),
      )
    )
      return;
    audio.stop();
    audio.clearTranscript();
    speech.stop();
    interview.clear();
    setPractice([]);
    setPreparation(undefined);
    setPracticeDraft({ question: '', answer: '' });
    setSessionInfo({ id: crypto.randomUUID(), createdAt: Date.now(), title: '' });
    setInput('');
    if (wipe) {
      try {
        clearAll(localStorage);
        setAccessToken('');
        clearGeminiKey();
        void refreshHealth();
        setSessions([]);
        setContext(defaultContext);
        setSettings({ ...defaultSettings, autosave: false });
        setSaveStatus('off');
        notify(t('ล้างข้อมูลในเบราว์เซอร์แล้ว', 'Local data cleared.'));
      } catch {
        notify('Unable to clear storage. Use browser site settings to remove local data.');
      }
    }
    setTab('workspace');
  };
  const enumerate = async () => {
    try {
      setDevices(
        (await navigator.mediaDevices.enumerateDevices()).filter(
          (device) => device.kind === 'audioinput',
        ),
      );
    } catch {
      notify(
        t(
          'อ่านรายชื่อไมโครโฟนไม่ได้ กรุณาใช้ HTTPS และตรวจสิทธิ์',
          'Unable to list microphones. Check permissions and HTTPS.',
        ),
      );
    }
  };
  const queued = interview.questions.filter((q) => q.status === 'queued');
  const visible = interview.questions.filter(
    (q) => q.status !== 'dismissed' && q.text.toLowerCase().includes(filter.toLowerCase()),
  );
  const tokens = interview.answers.reduce(
    (sum, a) =>
      sum +
      (a.usage ? a.usage.inputTokens + a.usage.outputTokens + a.usage.thinkingTokens : 0) +
      (a.reviewUsage
        ? a.reviewUsage.inputTokens + a.reviewUsage.outputTokens + a.reviewUsage.thinkingTokens
        : 0),
    0,
  );
  const elapsed = interview.questions.length
    ? Math.max(
        0,
        Math.floor((now - Math.min(...interview.questions.map((q) => q.detectedAt))) / 1000),
      )
    : 0;
  const canAI = !offline && !!health?.hasApiKey;
  const nav = [
    { id: 'workspace' as const, icon: LayoutDashboard, label: t('พื้นที่เตรียมตัว', 'Workspace') },
    { id: 'practice' as const, icon: GraduationCap, label: t('ซ้อมสัมภาษณ์', 'Practice') },
    { id: 'preparation' as const, icon: Target, label: t('แผนเตรียมตัว', 'Role-fit plan') },
    { id: 'profile' as const, icon: BriefcaseBusiness, label: t('โปรไฟล์ของฉัน', 'My profile') },
    { id: 'sessions' as const, icon: Archive, label: t('ประวัติเซสชัน', 'Sessions') },
    { id: 'system' as const, icon: Settings2, label: t('สถานะระบบ', 'System') },
  ];
  return (
    <>
      <a className="skip-link" href="#main-content">
        {t('ข้ามไปเนื้อหาหลัก', 'Skip to main content')}
      </a>
      <div className={`app-shell ${focus ? 'focus-mode' : ''}`}>
        <aside className="sidebar">
          <a
            className="brand"
            href="#workspace"
            onClick={(e) => {
              e.preventDefault();
              setTab('workspace');
            }}
          >
            <span className="brand-mark">
              <Activity size={23} />
            </span>
            <span>
              interview<span className="brand-light">pulse</span>
              <small>YOUR INTERVIEW COMPANION</small>
            </span>
          </a>
          <div className="sidebar-section">PREPARE WITH PURPOSE</div>
          <nav aria-label={t('เมนูหลัก', 'Main navigation')}>
            {nav.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${tab === item.id ? 'selected' : ''}`}
                aria-current={tab === item.id ? 'page' : undefined}
                onClick={() => setTab(item.id)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {tab === item.id && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-tip">
            <div className="tip-icon">
              <Sparkles size={20} />
            </div>
            <h3>{t('เริ่มจากเรื่องจริงของคุณ', 'Make it your story.')}</h3>
            <p>
              {t(
                'เพิ่มโปรไฟล์เพื่อให้ทุกคำตอบสะท้อนประสบการณ์ของคุณ',
                'Add your profile for answers that reflect your experience.',
              )}
            </p>
            <button onClick={() => setTab('profile')}>
              {t('ปรับโปรไฟล์', 'Build your profile')}
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="sidebar-footer">
            <ShieldCheck size={15} />
            <span>{t('ประวัติเก็บในเบราว์เซอร์', 'History saved locally')}</span>
            <button
              className="icon-button"
              onClick={() => setShowHelp(true)}
              aria-label={t('วิธีใช้งาน', 'Help')}
            >
              <CircleHelp size={16} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              Interview Pulse <ChevronRight size={13} />
              <strong>{nav.find((item) => item.id === tab)?.label}</strong>
            </div>
            <div className="topbar-actions">
              <span className={`connection ${canAI ? 'ready' : ''}`}>
                <span />
                {canAI
                  ? t('AI ตั้งค่าแล้ว', 'AI configured')
                  : offline
                    ? t('ออฟไลน์', 'Offline')
                    : t('ตั้งค่าระบบ', 'Setup required')}
              </span>
              <select
                className="language-select"
                aria-label="Language"
                value={language}
                onChange={(e) =>
                  updateSettings({ ...settings, language: e.target.value as 'th' | 'en' })
                }
              >
                <option value="th">TH</option>
                <option value="en">EN</option>
              </select>
              <button
                className="icon-button"
                aria-label={t('วิธีใช้งาน', 'Help')}
                onClick={() => setShowHelp(true)}
              >
                <CircleHelp size={18} />
              </button>
            </div>
          </header>
          {offline && (
            <div className="offline-banner" role="status">
              <WifiOff size={15} />
              {t(
                'คุณกำลังออฟไลน์ ยังเปิดดูประวัติได้ แต่ฟีเจอร์ AI ต้องใช้อินเทอร์เน็ต',
                'You are offline. Saved sessions remain available; AI requires a connection.',
              )}
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button
                className="icon-button"
                onClick={() => setNotice('')}
                aria-label={t('ปิดข้อความ', 'Dismiss notification')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <main className="page-content" id="main-content">
            <div hidden={tab !== 'workspace'}>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="tiny-line" /> YOUR NEXT CHAPTER STARTS HERE
                  </div>
                  <h1>
                    {t('เตรียมพร้อม ตอบอย่างเป็นตัวคุณ', 'Your experience. Clearly expressed.')}
                  </h1>
                  <p>
                    {t(
                      'ฟังให้เข้าใจ จัดระเบียบความคิด แล้วเล่าเรื่องของคุณให้ชัดเจน',
                      'Find your words, organize your thoughts, and tell your story with clarity.',
                    )}
                  </p>
                </div>
                <div className="heading-actions">
                  <button
                    className="button"
                    onClick={() => downloadJson(snapshot, `interview-${snapshot.id}.json`)}
                  >
                    <Download size={15} />
                    {t('ส่งออก', 'Export')}
                  </button>
                  <button className="button" onClick={() => window.print()}>
                    <ArrowDownToLine size={15} />
                    {t('PDF', 'PDF')}
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => setFocus(!focus)}
                    aria-label={t('โหมดโฟกัส', 'Focus mode')}
                    title="Alt+Shift+F"
                  >
                    <Focus size={18} />
                  </button>
                </div>
              </div>
              {!health?.hasApiKey && (
                <div className="setup-banner">
                  <div>
                    <Sparkles size={18} />
                    <span>
                      {t(
                        'เพิ่ม Gemini API key ในหน้าตั้งค่าเพื่อเริ่มใช้งาน AI',
                        'Add your Gemini API key in Settings to enable AI coaching.',
                      )}
                    </span>
                  </div>
                  <button onClick={() => setTab('system')}>
                    {t('ดูวิธีตั้งค่า', 'Set up AI')}
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
              <div className="session-strip">
                <div className="session-identity">
                  <div className="session-avatar">
                    <BriefcaseBusiness size={19} />
                  </div>
                  <div>
                    <strong>
                      {context.role || t('เซสชันเตรียมสัมภาษณ์', 'Interview preparation')}
                    </strong>
                    <span>
                      {context.targetCompany ||
                        t(
                          'เพิ่มตำแหน่งและบริษัทในโปรไฟล์',
                          'Add your role and company in My profile',
                        )}
                    </span>
                  </div>
                  <button className="text-button" onClick={() => setTab('profile')}>
                    {t('แก้ไข', 'Edit')}
                  </button>
                </div>
                <div className="session-stats">
                  <div>
                    <strong>{interview.answers.length.toString().padStart(2, '0')}</strong>
                    <span>{t('คำตอบ', 'Answers')}</span>
                  </div>
                  <div>
                    <strong>{queued.length.toString().padStart(2, '0')}</strong>
                    <span>{t('รอคิว', 'Queued')}</span>
                  </div>
                  <div>
                    <strong>
                      {Math.floor(elapsed / 60)
                        .toString()
                        .padStart(2, '0')}
                      :{(elapsed % 60).toString().padStart(2, '0')}
                    </strong>
                    <span>{t('เวลาตั้งแต่คำถามแรก', 'Since first question')}</span>
                  </div>
                </div>
              </div>
              <div className="workspace-grid">
                <section className="queue-panel panel">
                  <div className="queue-heading">
                    <h2>
                      {t('คำถาม', 'Questions')}
                      <span>{visible.length}</span>
                    </h2>
                    <button
                      className="icon-button"
                      onClick={() => reset()}
                      aria-label={t('เซสชันใหม่', 'New session')}
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                  <input
                    className="queue-search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={t('ค้นหาคำถาม…', 'Find a question…')}
                    aria-label={t('ค้นหาคำถาม', 'Search questions')}
                  />
                  <div className="queue-list">
                    {visible.length === 0 ? (
                      <div className="queue-empty">
                        <BookOpen size={25} />
                        <p>
                          {filter
                            ? t('ไม่พบคำถาม', 'No matching questions')
                            : t('คำถามของคุณจะอยู่ที่นี่', 'Your questions will appear here.')}
                        </p>
                        <span>
                          {t('พิมพ์คำถาม หรือเปิดรับเสียง', 'Type a question or start listening.')}
                        </span>
                      </div>
                    ) : (
                      visible.map((q, i) => (
                        <div
                          className={`question-item ${interview.activeId === q.id ? 'active' : ''}`}
                          key={q.id}
                        >
                          <button
                            className="question-select"
                            onClick={() => void interview.analyze(q)}
                          >
                            <span className="question-number">
                              {(visible.length - i).toString().padStart(2, '0')}
                              <span className={`question-dot ${q.status}`} />
                            </span>
                            <span className="question-body">
                              <strong>{q.text}</strong>
                              <span className="question-info">
                                {
                                  {
                                    queued: t('รอคิว', 'Queued'),
                                    active: t('กำลังตอบ', 'Writing'),
                                    answered: t('เสร็จแล้ว', 'Complete'),
                                    error: t('ลองใหม่', 'Retry'),
                                    canceled: t('หยุดแล้ว', 'Stopped'),
                                    dismissed: t('ข้าม', 'Dismissed'),
                                  }[q.status]
                                }
                                {q.origin === 'speech' && q.confidence !== undefined
                                  ? ` · ${q.confidence}% ${t('ตรวจพบ', 'detected')}`
                                  : ''}
                              </span>
                            </span>
                          </button>
                          <button
                            className="dismiss-question"
                            aria-label={`${t('ข้ามคำถาม', 'Dismiss question')}: ${q.text}`}
                            onClick={() => interview.dismiss(q.id)}
                          >
                            <X size={12} />
                          </button>
                          {q.error && <p className="question-error">{q.error}</p>}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="queue-footer">
                    <label>
                      {t('ความมั่นใจในการตรวจคำถามขั้นต่ำ', 'Minimum detection confidence')}
                      <select
                        value={settings.minConfidence}
                        onChange={(e) =>
                          updateSettings({ ...settings, minConfidence: Number(e.target.value) })
                        }
                      >
                        {[40, 60, 75, 85].map((value) => (
                          <option key={value} value={value}>
                            {value}%
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      {t(
                        'คะแนนใช้กรองคำถามจากเสียง ไม่ใช่คุณภาพคำตอบ',
                        'Filters spoken questions; does not score answer quality.',
                      )}
                    </p>
                  </div>
                </section>
                <div className="answer-column">
                  <div className="input-panel panel">
                    <div className="input-toolbar">
                      <span className="eyebrow">
                        <span className={`signal-dot ${audio.listening ? 'on' : ''}`} />
                        {audio.listening
                          ? t('กำลังรับเสียง', 'LISTENING')
                          : t('เริ่มจากคำถาม', 'LET’S WORK ON A QUESTION')}
                      </span>
                      <button
                        className="text-button"
                        onClick={() => {
                          setShowAudio(true);
                          void enumerate();
                        }}
                      >
                        <SlidersHorizontal size={13} />
                        {t('ตั้งค่าเสียง', 'Audio settings')}
                      </button>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!input.trim() || !canAI) return;
                        interview.add(input);
                        setInput('');
                      }}
                    >
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        rows={3}
                        maxLength={5000}
                        aria-label={t('คำถามสัมภาษณ์', 'Interview question')}
                        placeholder={t(
                          'วางคำถามที่อยากเตรียมตอบ เช่น “เล่าโปรเจกต์ที่ท้าทายที่สุดให้ฟังหน่อย”',
                          'What would you like to prepare for? Try “Tell me about a challenging project.”',
                        )}
                      />
                      <div className="input-footer">
                        <button
                          type="button"
                          className={`button audio-button ${audio.listening ? 'recording' : ''}`}
                          disabled={!canAI && !audio.listening}
                          onClick={() => void audio.toggle()}
                        >
                          {audio.starting ? (
                            <LoaderCircle size={16} className="spin" />
                          ) : audio.listening ? (
                            <Square size={13} />
                          ) : (
                            <Mic size={16} />
                          )}{' '}
                          {audio.listening
                            ? t('หยุดรับเสียง', 'Stop listening')
                            : audio.starting
                              ? t('กำลังเปิด…', 'Starting…')
                              : t('เปิดรับเสียง', 'Start listening')}
                        </button>
                        <span className="micro muted input-count">{input.length}/5,000</span>
                        <button className="button primary" disabled={!input.trim() || !canAI}>
                          <Sparkles size={15} />
                          {t('เตรียมคำตอบ', 'Get coaching')}
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </form>
                    {(audio.status || audio.transcript) && (
                      <div className="transcript-panel">
                        <div>
                          <AudioLines size={15} />
                          <span>{audio.status}</span>
                          {audio.listening && (
                            <div className="audio-meter">
                              <i style={{ width: `${audio.level * 100}%` }} />
                            </div>
                          )}
                        </div>
                        {audio.transcript && (
                          <>
                            <p>{audio.transcript}</p>
                            <button
                              className="text-button"
                              onClick={() => {
                                setInput(audio.transcript.slice(0, 5000));
                                audio.stop();
                              }}
                            >
                              {t('นำข้อความที่ได้ยินมาแก้ไข', 'Edit the captured transcript')}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="answer-controls">
                    <div
                      className="segmented"
                      aria-label={t('ระดับการวิเคราะห์', 'Analysis depth')}
                    >
                      {(
                        [
                          { id: 'fast', label: t('เร็ว', 'Fast') },
                          { id: 'balanced', label: t('สมดุล', 'Balanced') },
                          { id: 'deep', label: t('ละเอียด', 'Deep') },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.id}
                          aria-pressed={settings.speed === option.id}
                          className={settings.speed === option.id ? 'selected' : ''}
                          onClick={() => updateSettings({ ...settings, speed: option.id })}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <div className="control-toggles">
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.useSearch}
                          onChange={(e) =>
                            updateSettings({ ...settings, useSearch: e.target.checked })
                          }
                        />
                        {t('ค้นเว็บ', 'Web search')}
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.quickStudy}
                          onChange={(e) =>
                            updateSettings({ ...settings, quickStudy: e.target.checked })
                          }
                        />
                        {t('สรุปสั้น', 'Quick study')}
                      </label>
                    </div>
                  </div>
                  <div className="quality-controls">
                    <label>
                      {t('ประเภทโจทย์', 'Question type')}
                      <select
                        value={settings.taskType}
                        onChange={(e) =>
                          updateSettings({
                            ...settings,
                            taskType: e.target.value as Settings['taskType'],
                          })
                        }
                      >
                        <option value="auto">{t('ตรวจอัตโนมัติ', 'Auto-detect')}</option>
                        <option value="technical">Technical</option>
                        <option value="coding">Coding</option>
                        <option value="system_design">System design</option>
                        <option value="behavioral">Behavioral / STAR</option>
                        <option value="case">Case / problem solving</option>
                      </select>
                    </label>
                    <label className="switch-label">
                      <input
                        type="checkbox"
                        checked={settings.verifyAnswers}
                        onChange={(e) =>
                          updateSettings({ ...settings, verifyAnswers: e.target.checked })
                        }
                      />
                      {t('ตรวจคำตอบซ้ำด้วย AI', 'AI consistency review')}
                    </label>
                    <p>
                      {t(
                        'เปิดการตรวจซ้ำช่วยหาข้อผิดพลาดและข้ออ้างที่ไม่มีหลักฐาน ใช้เวลาและ token เพิ่ม ไม่ใช่การยืนยันความถูกต้องทั้งหมด',
                        'Review checks for errors and unsupported claims. It adds time and tokens and is not independent verification.',
                      )}
                    </p>
                  </div>
                  {interview.busy && (
                    <div className="working-bar" role="status">
                      <span>
                        <LoaderCircle size={14} className="spin" />
                        {interview.phase === 'review'
                          ? t(
                              'กำลังตรวจคำตอบกับโจทย์และหลักฐาน…',
                              'Checking the draft against the question and evidence…',
                            )
                          : t('กำลังจัดระเบียบคำตอบของคุณ…', 'Putting your answer together…')}
                      </span>
                      <button onClick={interview.cancel}>
                        <Square size={11} />
                        {t('หยุด', 'Stop')}
                      </button>
                    </div>
                  )}
                  {interview.current ? (
                    <AnswerCard
                      answer={interview.current}
                      stale={interview.stale}
                      language={language}
                      onSpeak={(text) => void speech.speak(text)}
                      notify={notify}
                      onRegenerate={(tone) => {
                        const q = interview.questions.find(
                          (q) => q.id === interview.current?.questionId,
                        );
                        if (q) void interview.analyze(q, true, tone);
                      }}
                    />
                  ) : (
                    <section className="answer-empty panel">
                      <span className="empty-decoration one" />
                      <span className="empty-decoration two" />
                      <div className="orb">
                        <Sparkles size={30} />
                      </div>
                      <span className="eyebrow">A CLEARER ANSWER STARTS HERE</span>
                      <h2>
                        {t(
                          'ไม่ต้องมีคำตอบที่สมบูรณ์แบบ\nแค่เริ่มจากคำถามแรก',
                          'You have the experience.\nLet’s find the words.',
                        )}
                      </h2>
                      <p>
                        {t(
                          'รับแนวทางตอบที่กระชับ ตัวอย่างบทพูด และประเด็นที่ควรระวัง โดยอ้างอิงโปรไฟล์ของคุณ',
                          'Get a clear opening answer, a suggested script, and practical coaching grounded in your profile.',
                        )}
                      </p>
                      <div className="suggestions">
                        {[
                          t('แนะนำตัวเองอย่างไรให้น่าสนใจ?', 'How should I introduce myself?'),
                          t('เล่าถึงการแก้ปัญหาที่ท้าทาย', 'Tell me about a challenging problem.'),
                        ].map((text) => (
                          <button onClick={() => setInput(text)} key={text}>
                            {text}
                            <ArrowRight size={13} />
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  {queued.length > 0 && !interview.busy && (
                    <button
                      className="next-question button"
                      disabled={!canAI}
                      onClick={() => void interview.analyze(queued[queued.length - 1])}
                    >
                      {t('ตอบคำถามถัดไปในคิว', 'Coach the next queued question')}
                      <ArrowRight size={15} />
                    </button>
                  )}
                  <Copilot
                    key={sessionInfo.id}
                    context={context}
                    question={interview.current?.question || ''}
                    language={language}
                    notify={notify}
                  />
                </div>
                <aside className="insights-column">
                  <section className="panel prep-card">
                    <div className="eyebrow">
                      <BriefcaseBusiness size={14} /> YOUR CONTEXT
                    </div>
                    <h3>{context.role || t('ปรับคำตอบให้ตรงกับคุณ', 'Make it personal.')}</h3>
                    <p>
                      {context.targetCompany ||
                        t(
                          'เริ่มด้วยข้อมูลตำแหน่ง บริษัท และประสบการณ์',
                          'Add your role, company and experience.',
                        )}
                    </p>
                    <div className="context-check">
                      <span className={context.resume ? 'done' : ''}>
                        <Check size={13} />
                      </span>
                      {t('ประสบการณ์จริง', 'Experience')}
                      <strong>
                        {context.resume ? t('มีแล้ว', 'Added') : t('ยังไม่มี', 'Not added')}
                      </strong>
                    </div>
                    <div className="context-check">
                      <span className={context.jd ? 'done' : ''}>
                        <Check size={13} />
                      </span>
                      {t('รายละเอียดงาน', 'Job description')}
                      <strong>
                        {context.jd ? t('มีแล้ว', 'Added') : t('ยังไม่มี', 'Not added')}
                      </strong>
                    </div>
                    <button className="button full-width" onClick={() => setTab('profile')}>
                      {t('จัดการโปรไฟล์', 'Edit profile')}
                      <ArrowRight size={14} />
                    </button>
                  </section>
                  <section className="coaching-tip">
                    <span className="eyebrow">
                      <BookOpen size={14} /> SMALL REMINDER
                    </span>
                    <h3>{t('พูดจากสิ่งที่คุณเคยทำจริง', 'Specific beats impressive.')}</h3>
                    <p>
                      {t(
                        'เล่าว่าคุณรับผิดชอบอะไร ตัดสินใจอย่างไร และเกิดผลลัพธ์อะไร ให้ตัวอย่างจริงทำหน้าที่แทนคำขยาย',
                        'Explain what you owned, why you made a decision, and what changed. Let real examples do the work.',
                      )}
                    </p>
                  </section>
                  <section className="panel session-details">
                    <h3>{t('เซสชันนี้', 'This session')}</h3>
                    <div>
                      <span>{t('จำนวน token', 'Tokens used')}</span>
                      <strong>{tokens.toLocaleString()}</strong>
                    </div>
                    <div>
                      <span>{t('บันทึกอัตโนมัติ', 'Autosave')}</span>
                      <strong>
                        {saveStatus === 'saved'
                          ? t('บันทึกแล้ว', 'Saved')
                          : saveStatus === 'restored'
                            ? t('กู้คืนแล้ว', 'Restored')
                            : settings.autosave
                              ? t('กำลังบันทึก', 'Saving')
                              : t('ปิด', 'Off')}
                      </strong>
                    </div>
                    <label className="switch-label">
                      <input
                        type="checkbox"
                        checked={settings.autoSpeak}
                        onChange={(e) =>
                          updateSettings({ ...settings, autoSpeak: e.target.checked })
                        }
                      />
                      <span>{t('อ่านคำตอบอัตโนมัติ', 'Read answers aloud')}</span>
                    </label>
                    <p className="micro muted">
                      {t(
                        'ใช้หูฟังเพื่อไม่ให้เสียงอ่านย้อนเข้าไมค์',
                        'Use headphones to avoid capturing the spoken answer.',
                      )}
                    </p>
                  </section>
                  <button className="practice-link" onClick={() => setTab('practice')}>
                    <GraduationCap size={20} />
                    <span>
                      <strong>{t('ลองซ้อมหนึ่งรอบไหม?', 'Ready for a practice round?')}</strong>
                      <small>
                        {t('รับ feedback จากคำตอบของคุณ', 'Get feedback on your own answer')}
                      </small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                </aside>
              </div>
              <footer className="workspace-footer">
                <ShieldCheck size={13} />
                <span>
                  {t(
                    'ประวัติเก็บในเบราว์เซอร์ · ข้อความและเสียงที่ใช้ AI จะส่งให้ Gemini',
                    'History stays in your browser · AI requests send content to Gemini',
                  )}
                </span>
                <button className="text-button" onClick={() => setShowHelp(true)}>
                  {t('เรียนรู้เพิ่มเติม', 'Learn more')}
                </button>
              </footer>
            </div>
            <div hidden={tab !== 'preparation'}>
              <PreparationPanel
                key={sessionInfo.id}
                context={context}
                language={language}
                saved={preparation}
                onSave={setPreparation}
                canAI={canAI}
                notify={notify}
                onQuestion={(question) => {
                  setInput(question.slice(0, 5000));
                  setTab('workspace');
                }}
              />
            </div>
            <div hidden={tab !== 'profile'}>
              <ProfilePanel
                key={sessionInfo.id + ':' + context.role + ':' + context.targetCompany}
                context={context}
                language={language}
                onSave={setContext}
                notify={notify}
              />
            </div>
            <div hidden={tab !== 'practice'}>
              <PracticePanel
                key={sessionInfo.id}
                context={context}
                language={language}
                turns={practice}
                settings={settings}
                onSettings={updateSettings}
                onTurns={setPractice}
                draft={practiceDraft}
                onDraft={setPracticeDraft}
                notify={notify}
              />
            </div>
            <div hidden={tab !== 'sessions'}>
              <SessionsPanel
                key={sessionInfo.id}
                sessions={sessions}
                settings={settings}
                language={language}
                currentTitle={currentTitle}
                onSettings={updateSettings}
                onRestore={restore}
                onDelete={(id) => saveLibrary(sessions.filter((s) => s.id !== id))}
                onSave={(title) => {
                  if (
                    sessions.length >= 100 &&
                    !sessions.some((session) => session.id === snapshot.id)
                  ) {
                    notify(
                      t(
                        'เก็บได้สูงสุด 100 เซสชัน ส่งออกหรือลบเซสชันเก่าก่อนเพิ่มใหม่',
                        'Library limit reached (100 sessions). Export or remove an old session before adding another.',
                      ),
                    );
                    return;
                  }
                  const saved = { ...snapshot, title, lastUpdated: Date.now() };
                  if (saveLibrary([saved, ...sessions.filter((s) => s.id !== saved.id)])) {
                    setSessionInfo((prev) => ({ ...prev, title }));
                    notify(t('บันทึกเซสชันแล้ว', 'Session saved.'));
                  }
                }}
                onWipe={() => reset(true)}
                notify={notify}
              />
            </div>
            <div hidden={tab !== 'system'}>
              <SystemPanel
                key={sessionInfo.id}
                health={health}
                language={language}
                onRefresh={() => void refreshHealth()}
                notify={notify}
              />
            </div>
          </main>
        </div>
        {focus && (
          <button className="focus-exit button" onClick={() => setFocus(false)}>
            <Focus size={15} />
            {t('ออกจากโหมดโฟกัส', 'Exit focus mode')}
          </button>
        )}
        {speech.playing && (
          <button className="speech-stop button primary" onClick={speech.stop}>
            <VolumeX size={16} />
            {t('หยุดเสียงอ่าน', 'Stop audio')}
          </button>
        )}
        {showAudio && (
          <Modal
            title={t('ตั้งค่าการรับเสียง', 'Audio settings')}
            onClose={() => setShowAudio(false)}
          >
            <p className="muted">
              {t(
                'เริ่มรับเสียงเมื่อผู้เข้าร่วมรับทราบ การรับเสียงจากแท็บขึ้นกับเบราว์เซอร์และระบบปฏิบัติการ',
                'Start capture with participants’ awareness. Tab audio support depends on your browser and operating system.',
              )}
            </p>
            <label>
              {t('แหล่งเสียง', 'Audio source')}
              <select
                value={settings.audioSource}
                onChange={(e) =>
                  updateSettings({
                    ...settings,
                    audioSource: e.target.value as Settings['audioSource'],
                  })
                }
              >
                <option value="microphone">{t('ไมโครโฟน', 'Microphone')}</option>
                <option value="tab">{t('เสียงจากแท็บที่แชร์', 'Shared tab audio')}</option>
              </select>
            </label>
            {settings.audioSource === 'microphone' && (
              <label>
                {t('อุปกรณ์รับเสียง', 'Microphone device')}
                <select
                  aria-label={t('อุปกรณ์รับเสียง', 'Microphone device')}
                  value={settings.deviceId}
                  onChange={(e) => updateSettings({ ...settings, deviceId: e.target.value })}
                >
                  <option value="">
                    {t('ค่าเริ่มต้น · Browser speech', 'Default · Browser speech')}
                  </option>
                  {devices.map((device, i) => (
                    <option key={device.deviceId || i} value={device.deviceId}>
                      {device.label || `Microphone ${i + 1}`}
                    </option>
                  ))}
                </select>
                <span className="micro muted">
                  {t(
                    'เลือกอุปกรณ์เพื่อใช้การถอดเสียงผ่าน Gemini ทุกประมาณ 5 วินาที',
                    'Select a device to transcribe captured audio through Gemini in ~5 second segments.',
                  )}
                </span>
              </label>
            )}
            <div className="privacy-box">
              <Headphones size={23} />
              <p>
                {t(
                  'แนะนำ Chrome หรือ Edge บน HTTPS ใช้หูฟังเมื่อเปิดเสียงอ่านอัตโนมัติ โหมด Browser speech อาจส่งเสียงไปยังบริการของเบราว์เซอร์',
                  'Use Chrome or Edge over HTTPS. Wear headphones for read-aloud. Browser speech may send audio to the browser’s speech service.',
                )}
              </p>
            </div>
            <button className="button primary full-width" onClick={() => setShowAudio(false)}>
              {t('เสร็จแล้ว', 'Done')}
            </button>
          </Modal>
        )}
        {showHelp && (
          <Modal
            title={t('เริ่มต้นกับ Interview Pulse', 'Getting started')}
            onClose={() => setShowHelp(false)}
          >
            <ol className="help-steps">
              <li>
                <strong>{t('ตั้งค่า AI', 'Connect AI')}</strong>
                <p>
                  {t(
                    'ตั้ง GEMINI_API_KEY บนเซิร์ฟเวอร์ ดูรายละเอียดในหน้าสถานะระบบ',
                    'Set GEMINI_API_KEY on the server. See System for setup details.',
                  )}
                </p>
              </li>
              <li>
                <strong>{t('เพิ่มโปรไฟล์จริง', 'Add your real profile')}</strong>
                <p>
                  {t(
                    'เพิ่มประสบการณ์และ JD เพื่อช่วยให้คำตอบตรงกับตัวคุณ',
                    'Add your experience and job description for grounded coaching.',
                  )}
                </p>
              </li>
              <li>
                <strong>{t('เริ่มจากคำถามหรือซ้อมสัมภาษณ์', 'Ask or practice')}</strong>
                <p>
                  {t(
                    'พิมพ์คำถาม เปิดรับเสียง หรือใช้โหมดซ้อมเพื่อรับ feedback',
                    'Type a question, start audio capture or practice for feedback.',
                  )}
                </p>
              </li>
              <li>
                <strong>{t('บันทึกและส่งออก', 'Save and export')}</strong>
                <p>
                  {t(
                    'เซสชันเก็บในเบราว์เซอร์ ส่งออก JSON เพื่อสำรองข้อมูล หรือ PDF ผ่านหน้าพิมพ์',
                    'Sessions are browser-local. Export JSON for backup, or save a PDF through the print dialog.',
                  )}
                </p>
              </li>
            </ol>
            <p className="privacy-note">
              {t(
                'ข้อมูลที่ส่งวิเคราะห์จะถูกประมวลผลโดย Gemini ไม่มีการรับประกันผลสัมภาษณ์ ค่าใช้จ่ายขึ้นกับบัญชีผู้ให้บริการ',
                'AI content is processed by Gemini. Coaching does not guarantee interview outcomes. Provider usage may incur charges.',
              )}
            </p>
            <p className="micro muted">Focus shortcut: Alt + Shift + F</p>
          </Modal>
        )}
      </div>
      <section className="print-report">
        <h1>Interview Pulse · {currentTitle}</h1>
        <p>
          {new Date().toLocaleString()} · {context.role} · {context.targetCompany}
        </p>
        {interview.answers.length === 0 && practice.length === 0 && !preparation && (
          <p>{t('ยังไม่มีคำตอบหรือบันทึกการฝึก', 'No completed answers or practice notes yet.')}</p>
        )}
        {preparation && (
          <article>
            <h2>{t('แผนเตรียมตัวตามตำแหน่ง', 'Role-fit preparation plan')}</h2>
            <p>{preparation.plan.summary}</p>
            {preparation.plan.requirements.map((item, i) => (
              <div key={i}>
                <h3>
                  {item.requirement} · {item.priority} · {item.status}
                </h3>
                <p>{item.gap}</p>
                {item.evidence.map((proof, j) => (
                  <p key={j}>
                    {proof.source}: “{proof.quote}” · {proof.relevance}
                  </p>
                ))}
                <p>{item.practiceQuestion}</p>
              </div>
            ))}
            {preparation.plan.plan.map((day, i) => (
              <div key={i}>
                <h3>
                  Day {day.day} · {day.focus}
                </h3>
                <p>{day.actions.join('\n')}</p>
                <p>{day.successCheck}</p>
              </div>
            ))}
            <p>
              {t(
                'แผนจาก AI ไม่ใช่การคาดการณ์ผลการสมัคร',
                'AI preparation guidance, not a hiring prediction.',
              )}
            </p>
          </article>
        )}
        {[...interview.answers].reverse().map((a) => (
          <article key={a.id}>
            <h2>{a.question}</h2>
            <p>{a.directAnswer}</p>
            {[
              { title: 'Suggested script', text: a.exampleScript },
              { title: 'Question intent', text: a.questionIntent },
              { title: 'Assumptions', text: a.assumptions },
              { title: 'Clarify', text: a.clarifyingQuestions },
              { title: 'Evaluation', text: a.howItWorks },
              { title: 'Reasoning', text: a.reasoningSteps },
              { title: 'Validation', text: a.validationSteps },
              { title: 'Code (not executed)', text: a.solutionCode },
              { title: 'Follow-ups', text: a.followUpQuestions },
              { title: 'Pitfalls', text: a.commonPitfalls },
              { title: 'Recovery', text: a.solutions },
            ].map((s) => (
              <div key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
            <p>
              {a.riskLevel}: {a.riskSummary}
            </p>
            {a.webSources.map((s) => (
              <p key={s.uri}>
                {s.title} · {s.uri}
              </p>
            ))}
            {a.review && (
              <section>
                <h3>AI consistency review · {a.review.verdict}</h3>
                <p>{a.review.summary}</p>
                {a.review.concerns.map((item, i) => (
                  <p key={i}>
                    {item.claim} — {item.reason}
                  </p>
                ))}
                {a.review.evidence.map((item, i) => (
                  <p key={i}>
                    {item.source}: “{item.quote}” · {item.relevance}
                  </p>
                ))}
                <p>AI review is not independent verification.</p>
              </section>
            )}
            <small>{a.modelUsed}</small>
          </article>
        ))}
        {practice.map((turn) => (
          <article key={turn.id}>
            <h2>{turn.question}</h2>
            <p>{turn.answer}</p>
            <h3>Feedback</h3>
            <p>{turn.feedback}</p>
            <p>
              {Object.entries(turn.scores)
                .map(([key, value]) => `${key}: ${value}/5`)
                .join(' · ')}
            </p>
          </article>
        ))}
      </section>
    </>
  );
}
