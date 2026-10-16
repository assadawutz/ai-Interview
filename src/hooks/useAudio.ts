import { useEffect, useRef, useState } from 'react';
import { detectionSchema, type Settings, type QueuedQuestion } from '../../shared/contracts';
import { AudioService } from '../utils/audioService';
import { request } from '../lib/api';
export function useAudio(
  settings: Settings,
  add: (
    text: string,
    origin: 'speech',
    confidence: number,
    category: QueuedQuestion['category'],
  ) => void,
  questions: QueuedQuestion[],
  notify: (message: string) => void,
  allowServerTranscription = true,
) {
  const service = useRef<AudioService | null>(null);
  service.current ??= new AudioService();
  const [listening, setListening] = useState(false),
    [starting, setStarting] = useState(false);
  const [level, setLevel] = useState(0),
    [transcript, setTranscript] = useState(''),
    [status, setStatus] = useState('');
  const latest = useRef({ settings, add, questions, notify });
  latest.current = { settings, add, questions, notify };
  const fragments = useRef('');
  const heard = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detection = useRef<AbortController | null>(null),
    queue = useRef<Promise<void>>(Promise.resolve());
  const epoch = useRef(0),
    pending = useRef(0);
  const resetPipeline = () => {
    epoch.current++;
    if (timer.current) clearTimeout(timer.current);
    if (maxTimer.current) clearTimeout(maxTimer.current);
    timer.current = null;
    maxTimer.current = null;
    fragments.current = '';
    detection.current?.abort();
    queue.current = Promise.resolve();
    pending.current = 0;
    setListening(false);
    setStarting(false);
    setLevel(0);
  };
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    if (maxTimer.current) clearTimeout(maxTimer.current);
    timer.current = null;
    maxTimer.current = null;
    const text = fragments.current.trim();
    fragments.current = '';
    if (text.length < 4) return;
    if (pending.current >= 2) {
      setStatus(
        'Question detection is catching up. Review the transcript and submit any missed question manually.',
      );
      return;
    }
    pending.current++;
    const generation = epoch.current;
    queue.current = queue.current.then(async () => {
      if (generation !== epoch.current) return;
      const state = latest.current;
      const controller = new AbortController();
      detection.current = controller;
      try {
        const result = await request<unknown>(
          'detect-question',
          {
            transcript: text,
            existingQuestions: state.questions
              .filter((q) => q.status !== 'dismissed')
              .slice(0, 30)
              .map((q) => q.text),
            language: state.settings.language,
          },
          controller.signal,
        );
        if (generation !== epoch.current) return;
        const data = detectionSchema.parse(result);
        if (
          data.isQuestion &&
          !data.isDuplicate &&
          data.confidence >= latest.current.settings.minConfidence
        ) {
          setStatus(
            latest.current.settings.language === 'th'
              ? `ตรวจพบคำถาม (${Math.round(data.confidence)}%)`
              : `Question detected (${Math.round(data.confidence)}%).`,
          );
          latest.current.add(data.cleanQuestion, 'speech', data.confidence, data.category);
        } else if (data.isQuestion && !data.isDuplicate)
          setStatus(
            `Question detection below ${latest.current.settings.minConfidence}% threshold. Review and edit the transcript to submit it manually.`,
          );
      } catch (error) {
        if (!controller.signal.aborted && generation === epoch.current)
          latest.current.notify(
            error instanceof Error
              ? error.message
              : 'Question detection failed. Review the transcript.',
          );
      } finally {
        if (generation === epoch.current) pending.current--;
      }
    });
  };
  const stop = () => {
    resetPipeline();
    service.current!.stop();
    setStatus('');
  };
  const toggle = async () => {
    if (listening || starting) {
      stop();
      return;
    }
    resetPipeline();
    setTranscript('');
    heard.current = '';
    setStarting(true);
    setStatus('Requesting audio permission…');
    await service.current!.start({
      allowServerTranscription,
      source: settings.audioSource,
      deviceId: settings.deviceId,
      language: settings.language,
      onLevel: setLevel,
      onStatus: setStatus,
      onError: (message) => latest.current.notify(message),
      onStop: resetPipeline,
      onTranscript: (text, final) => {
        if (!final) {
          setTranscript(`${heard.current} ${text}`.trim());
          return;
        }
        fragments.current = `${fragments.current} ${text}`.slice(-10000);
        heard.current = `${heard.current} ${text}`.trim().slice(-12000);
        setTranscript(heard.current);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, 1200);
        maxTimer.current ??= setTimeout(flush, 6000);
      },
    });
    setStarting(false);
    setListening(service.current!.isListening);
  };
  useEffect(() => {
    stop();
    return stop;
  }, [settings.audioSource, settings.deviceId, settings.language, allowServerTranscription]);
  return {
    listening,
    starting,
    level,
    transcript,
    status,
    toggle,
    stop,
    clearTranscript: () => {
      heard.current = '';
      setTranscript('');
    },
  };
}
