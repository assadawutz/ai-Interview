import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerReviewSchema,
  contextSchema,
  preparationSchema,
  defaultSettings,
  sessionSchema,
} from '../shared/contracts';
import { checkEvidence, checkPreparation, replaceSection } from '../shared/quality';
import { answerFingerprint } from '../shared/fingerprint';
const context = contextSchema.parse({
  resume: 'I led a TypeScript migration with two teams.',
  jd: 'Requires Kubernetes experience.',
  stories: [
    {
      id: 's1',
      title: 'Migration',
      situation: 'Legacy service',
      task: 'Plan migration',
      action: 'Introduced staged releases',
      result: 'Completed without downtime',
      skills: 'TypeScript',
    },
  ],
});
test('review rejects invented evidence quotes and cannot retain a clean verdict for critical concerns', () => {
  const review = answerReviewSchema.parse({
    verdict: 'consistent',
    summary: 'Review',
    evidence: [
      { source: 'resume', quote: 'I improved revenue by 80%.', relevance: 'Claim' },
      { source: 'resume', quote: 'I led a TypeScript migration', relevance: 'Actual statement' },
    ],
    concerns: [],
    missingInformation: [],
  });
  const checked = checkEvidence(review, context);
  assert.equal(checked.evidence.length, 1);
  assert.equal(checked.verdict, 'needs_revision');
  assert.equal(checked.evidence[0].quote, 'I led a TypeScript migration');
  assert.equal(checked.revisedDirectAnswer, '');
  assert.equal(
    checkEvidence(
      {
        ...review,
        evidence: [],
        concerns: [{ severity: 'critical', claim: 'Wrong claim', reason: 'Incorrect' }],
      },
      context,
    ).verdict,
    'needs_revision',
  );
});
test('story evidence must match the identified story, not an unrelated field', () => {
  const review = answerReviewSchema.parse({
    verdict: 'consistent',
    summary: 'Review',
    evidence: [
      { source: 'story', storyId: 's1', quote: 'Introduced staged releases', relevance: 'Action' },
      {
        source: 'story',
        storyId: 'other',
        quote: 'Introduced staged releases',
        relevance: 'Wrong story',
      },
    ],
    concerns: [],
    missingInformation: [],
  });
  assert.equal(checkEvidence(review, context).evidence.length, 1);
});
test('job requirements never become evidence of candidate skills', () => {
  const plan = preparationSchema.parse({
    summary: 'Prepare',
    requirements: [
      {
        requirement: 'Kubernetes',
        priority: 'must_have',
        status: 'evidence_available',
        evidence: [
          { source: 'jd', quote: 'Requires Kubernetes experience.', relevance: 'JD requirement' },
        ],
        gap: 'Ask for actual experience',
        practiceQuestion: 'How do you manage deployments?',
      },
    ],
    plan: [
      {
        day: 1,
        focus: 'Practice',
        actions: ['Explain a real project'],
        successCheck: 'Give a clear example',
      },
    ],
    questionsToAsk: [],
    missingInformation: [],
  });
  assert.equal(checkPreparation(plan, context).requirements[0].status, 'not_provided');
});
test('review correction replaces the entire section without leaving the wrong claim behind', () => {
  const raw =
    '# [DIRECT_ANSWER]\nWrong claim\nMore wrong text\n# [HOW_IT_WORKS]\nExplanation\n# [EXECUTIVE_SUMMARY]\nSummary';
  const corrected = replaceSection(raw, 'DIRECT_ANSWER', 'Corrected explanation');
  assert.doesNotMatch(corrected, /Wrong claim|More wrong/);
  assert.match(corrected, /Corrected explanation/);
  assert.match(corrected, /Explanation/);
  assert.match(corrected, /Summary/);
});
test('cached answers change identity with profile, task type, output language and review mode', async () => {
  const key = await answerFingerprint('Question?', context, defaultSettings, 'balanced');
  for (const [changedContext, changedSettings] of [
    [{ ...context, resume: 'Different experience' }, defaultSettings],
    [context, { ...defaultSettings, language: 'en' as const }],
    [context, { ...defaultSettings, taskType: 'coding' as const }],
    [context, { ...defaultSettings, verifyAnswers: false }],
  ] as const)
    assert.notEqual(
      await answerFingerprint('Question?', changedContext, changedSettings, 'balanced'),
      key,
    );
});
test('v2 sessions migrate to v3 with safe defaults for review and evidence fields', () => {
  const session = sessionSchema.parse({
    version: 2,
    id: 'old',
    title: 'Old session',
    createdAt: 1,
    lastUpdated: 1,
    autoExpireHours: 24,
    context: {},
    questions: [],
    answers: [],
    settings: {},
  });
  assert.equal(session.version, 3);
  assert.deepEqual(session.context.stories, []);
  assert.equal(session.settings?.verifyAnswers, true);
});

test('section markers inside code fences cannot overwrite the spoken answer or risk level', async () => {
  const { parseStreamedAnswer } = await import('../src/utils/answerParser');
  const { answerSchema } = await import('../shared/contracts');
  const raw =
    '# [DIRECT_ANSWER]\nExplain the parser.\n# [SOLUTION_CODE]\n```python\n# [DIRECT_ANSWER]\nprint("literal marker")\n```\n# [RISK_LEVEL]\nLOW\n# [EXECUTIVE_SUMMARY]\nTreat code as code.';
  const parsed = parseStreamedAnswer(
    raw,
    answerSchema.parse({
      id: 'a',
      questionId: 'q',
      question: 'Question',
      timestamp: 1,
      rawMarkdown: '',
    }),
  );
  assert.equal(parsed.directAnswer, 'Explain the parser.');
  assert.match(parsed.solutionCode, /literal marker/);
  assert.equal(parsed.riskLevel, 'LOW');
});
