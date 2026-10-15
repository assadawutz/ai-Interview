import { useState, useRef, useCallback, useEffect } from 'react';
import {
  answerSchema,
  type CandidateContext,
  type QueuedQuestion,
  type SmartAnswer,
  type Settings,
} from '../../shared/contracts';
import { answerFingerprint } from '../../shared/fingerprint';
import { streamAnswer } from '../lib/api';
import { parseStreamedAnswer, isDuplicateQuestion } from '../utils/answerParser';

export function useInterview(
  context: CandidateContext,
  settings: Settings,
  notify: (message: string) => void,
  speak: (text: string) => void,
) {
  const [questions, setQuestions] = useState<QueuedQuestion[]>([]);
  const [answers, setAnswers] = useState<SmartAnswer[]>([]);
  const [current, setCurrent] = useState<SmartAnswer | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'generation' | 'review'>('generation');
  const [stale, setStale] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef({ context, settings, answers, questions, notify, speak });
  latest.current = { context, settings, answers, questions, notify, speak };
  const updateQuestion = (id: string, patch: Partial<QueuedQuestion>) =>
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setCurrent((prev) =>
      prev?.isStreaming ? { ...prev, isStreaming: false, isLocked: false } : prev,
    );
    setQuestions((prev) =>
      prev.map((q) => (q.status === 'active' ? { ...q, status: 'canceled' } : q)),
    );
  }, []);
  const analyze = useCallback(
    async (q: QueuedQuestion, regenerate = false, tone = 'balanced') => {
      cancel();
      setActiveId(q.id);
      setStale(false);
      const state = latest.current;
      const token = new AbortController();
      controller.current = token;
      setBusy(true);
      setPhase('generation');
      try {
        const requestFingerprint = await answerFingerprint(
          q.text,
          state.context,
          state.settings,
          tone,
        );
        if (controller.current !== token) return;
        const saved = state.answers.find(
          (a) => a.questionId === q.id && a.isLocked && a.requestFingerprint === requestFingerprint,
        );
        if (saved && !regenerate && q.status === 'answered') {
          setCurrent(saved);
          return;
        }
        updateQuestion(q.id, { status: 'active', error: undefined });
        let answer = answerSchema.parse({
          id: crypto.randomUUID(),
          questionId: q.id,
          question: q.text,
          timestamp: Date.now(),
          confidence: q.confidence,
          rawMarkdown: '',
          isStreaming: true,
          tone,
          requestFingerprint,
          language: state.settings.language,
          reviewStatus: state.settings.verifyAnswers ? 'pending' : 'skipped',
        });
        let markdown = '';
        setCurrent(answer);
        await streamAnswer(
          {
            question: q.text,
            context: state.context,
            language: state.settings.language,
            speed: state.settings.speed,
            useSearch: state.settings.useSearch,
            isQuickStudy: state.settings.quickStudy,
            verifyAnswer: state.settings.verifyAnswers,
            taskType: state.settings.taskType,
            tone,
            pastQAs: state.answers
              .slice(0, 3)
              .map((a) => ({ question: a.question, directAnswer: a.directAnswer })),
          },
          token.signal,
          (event) => {
            if (controller.current !== token) return;
            if (event.type === 'meta') answer = { ...answer, modelUsed: event.model };
            if (event.type === 'phase') setPhase(event.phase);
            if (event.type === 'notice') state.notify(event.message);
            if (event.type === 'text') {
              markdown += event.text;
              answer = parseStreamedAnswer(markdown, answer);
            }
            if (event.type === 'done') {
              if (event.finalMarkdown) {
                if (event.finalMarkdown !== markdown)
                  answer = { ...answer, originalDraft: markdown };
                markdown = event.finalMarkdown;
                answer = parseStreamedAnswer(markdown, answer);
              }
              answer = {
                ...answer,
                modelUsed: event.model,
                usage: event.usage,
                elapsedMs: event.elapsedMs,
                firstTokenMs: event.firstTokenMs,
                estimatedCostUsd: event.estimatedCostUsd,
                webSources: event.sources,
                reviewStatus: event.reviewStatus,
                review: event.review,
                reviewModel: event.reviewModel,
                reviewUsage: event.reviewUsage,
                reviewCostUsd: event.reviewCostUsd,
              };
            }
            setCurrent({ ...answer });
          },
        );
        if (controller.current !== token || token.signal.aborted) return;
        if (!answer.directAnswer.trim()) throw new Error('The answer is incomplete. Please retry.');
        answer = { ...answer, isStreaming: false, isLocked: true };
        setCurrent(answer);
        setAnswers((prev) => [answer, ...prev.filter((a) => a.questionId !== q.id)].slice(0, 500));
        updateQuestion(q.id, { status: 'answered', error: undefined });
        const needsAttention =
          answer.review?.verdict !== 'consistent' && answer.reviewStatus !== 'skipped';
        if (state.settings.autoSpeak && !needsAttention) state.speak(answer.directAnswer);
      } catch (error) {
        if (controller.current !== token) return;
        if (token.signal.aborted) updateQuestion(q.id, { status: 'canceled' });
        else {
          const message = error instanceof Error ? error.message : 'Answer failed.';
          updateQuestion(q.id, { status: 'error', error: message });
          state.notify(message);
        }
        setCurrent((prev) => (prev ? { ...prev, isStreaming: false, isLocked: false } : null));
      } finally {
        if (controller.current === token) {
          controller.current = null;
          setBusy(false);
        }
      }
    },
    [cancel],
  );
  const add = useCallback(
    (
      text: string,
      origin: QueuedQuestion['origin'] = 'manual',
      confidence?: number,
      category: QueuedQuestion['category'] = 'other',
    ) => {
      const clean = text.trim();
      if (!clean || clean.length > 5000) return;
      if (
        origin === 'speech' &&
        latest.current.questions.some(
          (q) => q.status !== 'dismissed' && isDuplicateQuestion(q.text, clean),
        )
      )
        return;
      if (latest.current.questions.length >= 500) {
        latest.current.notify(
          'Session limit reached (500 questions). Save this session and start a new one.',
        );
        return;
      }
      const question: QueuedQuestion = {
        id: crypto.randomUUID(),
        text: clean,
        detectedAt: Date.now(),
        status: 'queued',
        origin,
        confidence,
        category,
      };
      latest.current.questions = [question, ...latest.current.questions];
      setQuestions((prev) => [question, ...prev]);
      if (origin !== 'speech' || !controller.current) void analyze(question);
    },
    [analyze],
  );
  const dismiss = (id: string) => {
    if (activeId === id) {
      cancel();
      setActiveId(null);
      setCurrent(null);
    }
    updateQuestion(id, { status: 'dismissed' });
  };
  const restore = (q: QueuedQuestion[], a: SmartAnswer[]) => {
    cancel();
    setQuestions(q);
    setAnswers(a);
    latest.current.questions = q;
    latest.current.answers = a;
    setCurrent(a[0] || null);
    setActiveId(a[0]?.questionId || null);
  };
  useEffect(() => {
    let active = true;
    if (!current?.requestFingerprint || current.isStreaming) {
      setStale(false);
      return;
    }
    void answerFingerprint(current.question, context, settings, current.tone)
      .then((key) => {
        if (active) setStale(key !== current.requestFingerprint);
      })
      .catch(() => {
        if (active) setStale(true);
      });
    return () => {
      active = false;
    };
  }, [context, settings, current?.requestFingerprint, current?.isStreaming]);
  useEffect(() => () => controller.current?.abort(), []);
  return {
    questions,
    answers,
    current,
    activeId,
    busy,
    phase,
    stale,
    analyze,
    add,
    cancel,
    dismiss,
    restore,
    clear: () => restore([], []),
  };
}
