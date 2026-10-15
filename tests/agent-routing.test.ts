import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { GenerateContentResponse } from '@google/genai';
import { createApp, type Provider } from '../server/app';
import { freeAgentRouting } from '../shared/routing';
import { agentDefaults, needsSpecialist } from '../shared/agents';
const catalog = Object.values(agentDefaults).map((id) => ({
  id,
  pricing: { prompt: '0', completion: '0' },
  supported_parameters: ['response_format'],
}));
function response() {
  const r = new GenerateContentResponse();
  r.candidates = [
    {
      content: {
        parts: [
          {
            text: '# [DIRECT_ANSWER]\nAnswer\n# [HOW_IT_WORKS]\nReason\n# [EXECUTIVE_SUMMARY]\nSummary',
          },
        ],
      },
      finishReason: 'STOP' as never,
    },
  ];
  return r;
}
async function run(failure: string, action: (base: string, calls: string[]) => Promise<void>) {
  const calls: string[] = [];
  const app = createApp({
    accessToken: '',
    freeCatalog: async () => catalog,
    externalFactory: (route) =>
      ({
        async generate() {
          calls.push(route.model);
          return response();
        },
        async stream() {
          calls.push(route.model);
          if (route.model === agentDefaults.specialist)
            throw Object.assign(new Error(failure), { status: 429 });
          return (async function* () {
            yield response();
          })();
        },
      }) satisfies Provider,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert(address && typeof address !== 'string');
    await action(`http://127.0.0.1:${address.port}`, calls);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
const headers = {
  'Content-Type': 'application/json',
  'X-LLM-Config': JSON.stringify(freeAgentRouting),
  'X-LLM-API-Key': 'test-free-provider-key',
};
test('specialist agent uses a verified free fallback before output when a model is rate limited', () =>
  run('minute rate', async (base, calls) => {
    const r = await fetch(base + '/api/analyze-question-stream', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        question: 'Explain database indexes',
        taskType: 'coding',
        verifyAnswer: false,
      }),
    });
    const body = await r.text();
    assert.match(body, /"type":"done"/);
    assert.deepEqual(calls, [agentDefaults.specialist, agentDefaults.fallback]);
  }));
test('account-wide daily quota does not retry the same free account or silently choose a paid route', () =>
  run('Rate limit exceeded: free-models-per-day', async (base, calls) => {
    const r = await fetch(base + '/api/analyze-question-stream', {
      method: 'POST',
      headers,
      body: JSON.stringify({ question: 'Explain SQL', taskType: 'coding', verifyAnswer: false }),
    });
    const body = await r.text();
    assert.match(body, /"type":"error"/);
    assert.doesNotMatch(body, /"type":"done"/);
    assert.deepEqual(calls, [agentDefaults.specialist]);
  }));
test('free-only mode blocks native media routes before a paid provider can be called', () =>
  run('', async (base, calls) => {
    const r = await fetch(base + '/api/transcribe', {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: 'AAAA', mimeType: 'audio/webm' }),
    });
    assert.equal(r.status, 400);
    assert.equal(calls.length, 0);
  }));
test('coordinator sends technical questions to a specialist and behavioral questions to the coach', () => {
  assert.equal(needsSpecialist('auto', 'Explain SQL indexes'), true);
  assert.equal(needsSpecialist('auto', 'อธิบายฐานข้อมูล'), true);
  assert.equal(needsSpecialist('behavioral', 'Tell me about a conflict'), false);
});
