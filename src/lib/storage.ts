import { sessionSchema, type InterviewSession } from '../../shared/contracts';
export const STORAGE_KEY = 'interviewpulse_sessions_v2';
export const DRAFT_KEY = 'interviewpulse_draft_v2';
export const LEGACY_KEY = 'interviewpulse_saved_sessions_v1';
const expires = (s: InterviewSession, now: number) =>
  now - s.lastUpdated >= s.autoExpireHours * 3600000;
function normalize(session: InterviewSession): InterviewSession {
  return {
    ...session,
    questions: session.questions.map((q) =>
      q.status === 'active' ? { ...q, status: 'canceled' } : q,
    ),
    answers: session.answers.map((a) => ({ ...a, isStreaming: false })),
  };
}
export function parseSession(raw: unknown): InterviewSession {
  return normalize(sessionSchema.parse(raw));
}
export function loadSessions(storage: Storage, now = Date.now()): InterviewSession[] {
  const raw = storage.getItem(STORAGE_KEY);
  const parsed: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(parsed))
    throw new Error('Saved sessions are invalid. Export or clear local storage.');
  const records = parsed.map((item) => sessionSchema.safeParse(item));
  if (records.some((result) => !result.success))
    throw new Error(
      'Some saved sessions are invalid. Original data was preserved. Download a recovery backup before repairing storage.',
    );
  const valid = records.flatMap((result) =>
    result.success && !expires(result.data, now) ? [normalize(result.data)] : [],
  );
  const serialized = JSON.stringify(valid);
  if (serialized !== JSON.stringify(parsed)) storage.setItem(STORAGE_KEY, serialized);
  return valid;
}
export function loadDraft(storage: Storage, now = Date.now()): InterviewSession | null {
  const raw = storage.getItem(DRAFT_KEY);
  if (!raw) return null;
  const parsed = sessionSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error('Recovery draft is invalid. Original data was preserved.');
  if (expires(parsed.data, now)) {
    storage.removeItem(DRAFT_KEY);
    return null;
  }
  return normalize(parsed.data);
}
export function saveSessions(storage: Storage, sessions: InterviewSession[]) {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify(sessions.map((session) => sessionSchema.parse(session))),
  );
}
export function writeDraft(storage: Storage, session: InterviewSession) {
  if (expires(session, Date.now())) {
    storage.removeItem(DRAFT_KEY);
    return;
  }
  storage.setItem(DRAFT_KEY, JSON.stringify(sessionSchema.parse(session)));
}
export function clearAll(storage: Storage) {
  for (const key of [STORAGE_KEY, DRAFT_KEY, LEGACY_KEY]) storage.removeItem(key);
}

/** Converts only the original application's known session shape; validates before removing the old store. */
export function migrateLegacy(storage: Storage, now = Date.now()): InterviewSession[] {
  const raw = storage.getItem(LEGACY_KEY);
  if (!raw) return [];
  const entries: unknown = JSON.parse(raw);
  if (!Array.isArray(entries)) throw new Error('Legacy sessions are invalid.');
  const category = (value: unknown) =>
    ({ strategy: 'situational', cultural: 'salary_culture', salary: 'salary_culture' })[
      String(value)
    ] ||
    value ||
    'other';
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const old = entry as Record<string, unknown>;
    const questions: Record<string, unknown>[] = Array.isArray(old.questions)
      ? old.questions.map((q: Record<string, unknown>) => ({
          ...q,
          category: category(q.category),
          origin: 'manual',
        }))
      : [];
    const answers = Array.isArray(old.answers)
      ? old.answers.map((a: Record<string, unknown>) => ({
          ...a,
          questionId: a.questionId || questions.find((q) => q.text === a.question)?.id || a.id,
          modelUsed: a.modelUsed || 'legacy (unverified)',
        }))
      : [];
    const result = sessionSchema.safeParse({ ...old, version: 2, questions, answers });
    if (!result.success)
      throw new Error('A legacy session could not be migrated. Original storage was preserved.');
    return !expires(result.data, now) ? [normalize(result.data)] : [];
  });
}

export function recoveryBackup(storage: Storage) {
  return {
    exportedAt: new Date().toISOString(),
    warning:
      'Raw local recovery backup. May contain personal information. Not a session import file.',
    stores: Object.fromEntries(
      [STORAGE_KEY, DRAFT_KEY, LEGACY_KEY].map((key) => [key, storage.getItem(key)]),
    ),
  };
}
