import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GenerateContentResponse } from '@google/genai';
import { ClientRuntime, clientError } from '../src/lib/client-runtime';
import { routingSchema } from '../shared/routing';
import type { Provider } from '../shared/provider';
const markdown =
  '# [DIRECT_ANSWER]\nUse verified facts.\n# [HOW_IT_WORKS]\nExplain assumptions.\n# [EXECUTIVE_SUMMARY]\nValidate results.';
const response = (text: string) => {
  const r = new GenerateContentResponse();
  r.candidates = [{ content: { parts: [{ text }] }, finishReason: 'STOP' as never }];
  return r;
};
const connection = { route: routingSchema.parse({}), key: '', geminiKey: 'test-client-key' };
function provider(generate: Provider['generate'], stream?: Provider['stream']): Provider {
  return {
    generate,
    stream:
      stream ||
      (async () =>
        (async function* () {
          yield response(markdown);
        })()),
  };
}
test('client health requires no backend and reflects selected provider policy', async () => {
  const runtime = new ClientRuntime({ ...connection, geminiKey: '' });
  const health = (await runtime.request('health', undefined, AbortSignal.timeout(1000))) as {
    hasApiKey: boolean;
    localLLMSupported: boolean;
    capabilities: { tts: boolean };
  };
  assert.equal(health.hasApiKey, false);
  assert.equal(health.localLLMSupported, true);
  assert.equal(health.capabilities.tts, false);
});
test('client validation prevents malformed requests reaching providers', async () => {
  let calls = 0;
  const runtime = new ClientRuntime(connection, () =>
    provider(async () => {
      calls++;
      return response('{}');
    }),
  );
  await assert.rejects(
    runtime.request('detect-question', { transcript: 42 }, AbortSignal.timeout(1000)),
  );
  assert.equal(calls, 0);
});
test('client quota failover selects the independent provider once and completes explicit stream', async () => {
  const models: string[] = [];
  const events: string[] = [];
  const runtime = new ClientRuntime(
    {
      ...connection,
      geminiKey: 'fallback-test-key',
      route: routingSchema.parse({ fallback: true, provider: 'ollama', model: 'test-local' }),
    },
    (model) => {
      models.push(model);
      return provider(
        async () => response('unused'),
        async () => {
          if (!model.startsWith('external:'))
            throw Object.assign(new Error('rate limit'), { status: 429 });
          return (async function* () {
            yield response(markdown);
          })();
        },
      );
    },
  );
  await runtime.stream(
    { question: 'How do you verify this?', verifyAnswer: false },
    AbortSignal.timeout(1000),
    (e) => events.push(e.type),
  );
  assert.equal(models.length, 2);
  assert.equal(models[1], 'external:ollama:test-local');
  assert.equal(events.at(-1), 'done');
});
test('client never retries or marks complete after partial output failure', async () => {
  let calls = 0;
  const events: string[] = [];
  const runtime = new ClientRuntime(
    {
      ...connection,
      route: routingSchema.parse({ fallback: true, provider: 'ollama', model: 'test-local' }),
    },
    () => {
      calls++;
      return provider(
        async () => response(''),
        async () =>
          (async function* () {
            yield response('# [DIRECT_ANSWER]\nPartial');
            throw Object.assign(new Error('rate limit'), { status: 429 });
          })(),
      );
    },
  );
  await assert.rejects(
    runtime.stream({ question: 'Explain?', verifyAnswer: false }, AbortSignal.timeout(1000), (e) =>
      events.push(e.type),
    ),
  );
  assert.equal(calls, 1);
  assert.equal(events.includes('done'), false);
});
test('client abort and invalid structured responses cannot become completed work', async () => {
  const controller = new AbortController();
  controller.abort();
  const runtime = new ClientRuntime(connection, () => provider(async () => response('not JSON')));
  await assert.rejects(runtime.request('copilot-chat', {}, controller.signal));
  await assert.rejects(
    runtime.request(
      'detect-question',
      { transcript: 'What is a queue?' },
      AbortSignal.timeout(1000),
    ),
    /invalid structured/,
  );
});
test('client provider errors are sanitized and do not echo credentials', () => {
  const e = clientError(Object.assign(new Error('secret-key-user-data'), { status: 403 }));
  assert.doesNotMatch(e.message, /secret-key/);
  assert.match(e.message, /Provider rejected/);
});
test('free-only policy blocks native file operations before provider calls', async () => {
  let calls = 0;
  const runtime = new ClientRuntime(
    { ...connection, route: routingSchema.parse({ freeOnly: true, provider: 'groq' }) },
    () => {
      calls++;
      return provider(async () => response(''));
    },
  );
  await assert.rejects(
    runtime.request(
      'analyze-doc',
      { data: 'AAAA', mimeType: 'application/pdf', fileType: 'resume' },
      AbortSignal.timeout(1000),
    ),
    /Free agents require OpenRouter/,
  );
  assert.equal(calls, 0);
});
