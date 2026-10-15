import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { readEvents, type StreamEvent } from '../src/lib/api';
import { answerSections } from '../shared/markdown';
const origin = process.env.EVAL_BASE_URL || 'http://127.0.0.1:3000';
const headers = {
  'Content-Type': 'application/json',
  ...(process.env.APP_ACCESS_TOKEN
    ? { Authorization: `Bearer ${process.env.APP_ACCESS_TOKEN}` }
    : {}),
};
const health = await (await fetch(`${origin}/api/health`)).json();
if (!health.hasApiKey) {
  console.error(
    'Live evaluation requires a configured Gemini key and running application. No AI requests were made.',
  );
  process.exit(1);
}
const cases = [
  {
    id: 'behavioral-evidence',
    question: 'Tell me about a migration you led. Do not invent any metrics.',
    context: {
      resume:
        'I coordinated a TypeScript migration with two teams. The measured outcome has not been provided.',
    },
    taskType: 'behavioral',
    humanCheck:
      'No invented achievements, percentages, employers or metrics. Clear ownership and explicit missing outcome.',
  },
  {
    id: 'coding-duplicates',
    question:
      'Implement twoSum in TypeScript returning indices. Handle duplicate values and no-solution cases; explain complexity and tests.',
    context: {},
    taskType: 'coding',
    humanCheck:
      'Indices are distinct, [3,3],6 works, no solution handled, map-based O(n) reasoning valid. Code still needs actual execution.',
  },
  {
    id: 'technical-consistency',
    question:
      'Explain eventual consistency versus strong consistency and when a user could observe stale data.',
    context: {},
    taskType: 'technical',
    humanCheck:
      'Correct definitions, visibility assumptions and concrete trade-offs without claiming all distributed systems behave identically.',
  },
  {
    id: 'ambiguous-design',
    question: 'Design a messaging platform.',
    context: {},
    taskType: 'system_design',
    humanCheck:
      'Clarifies workload, delivery guarantees and retention; no invented constraints presented as facts.',
  },
  {
    id: 'jd-not-experience',
    question: 'What Kubernetes production experience do you have?',
    context: {
      jd: 'Requires production Kubernetes experience.',
      resume: 'My experience is limited to local Docker development.',
    },
    taskType: 'behavioral',
    humanCheck:
      'Does not turn the JD into personal experience. Honest limitation and transferable skills.',
  },
  {
    id: 'business-case',
    question:
      'Revenue grew from 120 to 150. What is the percentage increase? Explain your calculation and how you check it.',
    context: {},
    taskType: 'case',
    humanCheck:
      '25%, using (150-120)/120; no confusion with percentage points or 20% decrease denominator.',
  },
];
console.log(
  'Running live structural checks; provider usage may be charged. Human correctness review remains required.',
);
const results = [];
for (const item of cases) {
  try {
    const response = await fetch(`${origin}/api/analyze-question-stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...item,
        language: 'en',
        speed: 'balanced',
        verifyAnswer: true,
        useSearch: false,
      }),
      signal: AbortSignal.timeout(health.requestTimeoutMs || 75000),
    });
    let markdown = '',
      completion: Extract<StreamEvent, { type: 'done' }> | undefined;
    await readEvents(response, (event) => {
      if (event.type === 'text') markdown += event.text;
      if (event.type === 'done') {
        completion = event;
        if (event.finalMarkdown) markdown = event.finalMarkdown;
      }
    });
    const sections = answerSections(markdown);
    results.push({
      id: item.id,
      structuralPass:
        !!sections.DIRECT_ANSWER && !!sections.HOW_IT_WORKS && !!sections.EXECUTIVE_SUMMARY,
      reviewStatus: completion?.reviewStatus,
      reviewVerdict: completion?.review?.verdict,
      model: completion?.model,
      usage: completion?.usage,
      reviewUsage: completion?.reviewUsage,
      elapsedMs: completion?.elapsedMs,
      humanCheck: item.humanCheck,
      markdown,
      review: completion?.review,
    });
    console.log(`${item.id}: response received; human review needed.`);
  } catch (error) {
    results.push({
      id: item.id,
      error: error instanceof Error ? error.message : 'Failed',
      humanCheck: item.humanCheck,
    });
    console.error(`${item.id}: request failed.`);
  }
}
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/live-evaluation.json',
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      notice:
        'Structural checks and AI consistency review are not proof of factual or code correctness.',
      results,
    },
    null,
    2,
  ),
);
console.log('Report: artifacts/live-evaluation.json');
if (results.some((result) => 'error' in result || !result.structuralPass)) process.exitCode = 1;
