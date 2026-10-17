import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerSchema, contextSchema, sessionSchema, defaultSettings } from '../shared/contracts';
import { parseStreamedAnswer, isDuplicateQuestion } from '../src/utils/answerParser';
import {
  loadDraft,
  loadSessions,
  clearAll,
  STORAGE_KEY,
  DRAFT_KEY,
  LEGACY_KEY,
  parseSession,
  migrateLegacy,
} from '../src/lib/storage';

const base = answerSchema.parse({
  id: 'a',
  questionId: 'q',
  question: 'Question',
  timestamp: 1,
  rawMarkdown: '',
  riskLevel: 'MEDIUM',
  riskSummary: 'Waiting',
});
const session = sessionSchema.parse({
  version: 2,
  id: 's',
  title: 'Session',
  createdAt: 1,
  lastUpdated: 1000,
  autoExpireHours: 1,
  context: contextSchema.parse({}),
  questions: [],
  answers: [],
  settings: defaultSettings,
});
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}
test('parsed risk and summary override placeholder values; partial sections stay readable', () => {
  const answer = parseStreamedAnswer(
    '# [DIRECT_ANSWER]\nจริง\n# [RISK_LEVEL]\nHIGH\n# [RISK_SUMMARY]\nWatch out\n# [EXECUTIVE_SUMMARY]\nSummary',
    base,
  );
  assert.equal(answer.riskLevel, 'HIGH');
  assert.equal(answer.riskSummary, 'Watch out');
  assert.equal(answer.directAnswer, 'จริง');
  assert.equal(answer.executiveSummary, 'Summary');
  assert.equal(parseStreamedAnswer('# [DIRECT_ANSWER]\nPartial', base).directAnswer, 'Partial');
});
test('duplicate filter does not collapse a distinct follow-up that contains the original', () => {
  assert.equal(isDuplicateQuestion('What is React?', 'what is react'), true);
  assert.equal(
    isDuplicateQuestion('What is React?', 'What is React and how does its reconciliation work?'),
    false,
  );
});
test('expired sessions and drafts are physically removed from browser storage', () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify([session]));
  storage.setItem(DRAFT_KEY, JSON.stringify(session));
  assert.deepEqual(loadSessions(storage, 3601001), []);
  assert.equal(storage.getItem(STORAGE_KEY), '[]');
  assert.equal(loadDraft(storage, 3601001), null);
  assert.equal(storage.getItem(DRAFT_KEY), null);
});
test('session restore marks unfinished questions canceled and validates imports', () => {
  const restored = parseSession({
    ...session,
    questions: [{ id: 'q', text: 'Question', detectedAt: 1, status: 'active' }],
  });
  assert.equal(restored.questions[0].status, 'canceled');
  assert.throws(() => parseSession({ version: 2, id: 'broken' }));
  assert.throws(() => contextSchema.parse({ companyWebsiteUrl: 'javascript:alert(1)' }));
});
test('privacy wipe removes current and legacy session stores only', () => {
  const storage = new MemoryStorage();
  for (const key of [STORAGE_KEY, DRAFT_KEY, LEGACY_KEY, 'unrelated']) storage.setItem(key, 'data');
  clearAll(storage);
  assert.equal(storage.length, 1);
  assert.equal(storage.getItem('unrelated'), 'data');
});

test('legacy migration preserves candidate facts and normalizes category/state', () => {
  const storage = new MemoryStorage();
  storage.setItem(
    LEGACY_KEY,
    JSON.stringify([
      {
        ...session,
        version: undefined,
        questions: [
          {
            id: 'q',
            text: 'Your approach?',
            detectedAt: 1000,
            status: 'active',
            category: 'strategy',
          },
        ],
        answers: [{ ...base, question: 'Your approach?', questionId: undefined }],
      },
    ]),
  );
  const migrated = migrateLegacy(storage, 2000);
  assert.equal(migrated[0].version, 3);
  assert.equal(migrated[0].questions[0].category, 'situational');
  assert.equal(migrated[0].questions[0].status, 'canceled');
  assert.equal(migrated[0].answers[0].questionId, 'q');
  assert.ok(storage.getItem(LEGACY_KEY));
});

test('corrupt session records are preserved instead of silently deleted', () => {
  const storage = new MemoryStorage();
  const raw = JSON.stringify([session, { broken: true }]);
  storage.setItem(STORAGE_KEY, raw);
  assert.throws(() => loadSessions(storage, 2000), /preserved/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  storage.setItem(DRAFT_KEY, '{"broken":true}');
  assert.throws(() => loadDraft(storage), /preserved/);
  assert.equal(storage.getItem(DRAFT_KEY), '{"broken":true}');
});
