import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { GenerateContentResponse } from '@google/genai';
import { createApp, type Provider } from '../server/app';
import { config } from '../server/config';
// Never use a developer's real credentials or model overrides during regression tests.
config.apiKey = '';
config.appUrl = '';
config.models = {
  fast: 'test-fast',
  balanced: 'test-balanced',
  deep: 'test-deep',
  fallback: 'test-fallback',
  transcription: 'test-transcription',
  tts: 'test-tts',
};

function response(text: string) {
  const result = new GenerateContentResponse();
  result.candidates = [{ content: { parts: [{ text }] } }];
  return result;
}
const provider: Provider = {
  async generate(params) {
    if (params.config?.responseMimeType === 'application/json')
      return response(
        JSON.stringify({
          isQuestion: true,
          cleanQuestion: 'Tell me about yourself?',
          confidence: 95,
          category: 'background',
          isDuplicate: false,
        }),
      );
    return response('Hello');
  },
  async stream() {
    return (async function* () {
      yield response(
        '# [DIRECT_ANSWER]\nAn honest answer.\n# [HOW_IT_WORKS]\nExplain the actual approach.\n# [RISK_LEVEL]\nLOW\n# [EXECUTIVE_SUMMARY]\nBe specific.',
      );
    })();
  },
};
async function withServer(
  run: (base: string) => Promise<void>,
  fake?: Provider,
  accessToken = '',
  providerFactory?: (key: string) => Provider,
) {
  const server = createApp({ provider: fake, accessToken, providerFactory }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
async function post(
  base: string,
  route: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(`${base}/api/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
test('health works without credentials and missing-key requests return an actionable error', () =>
  withServer(async (base) => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.status, 'setup_required');
    const result = await post(base, 'analyze-question-stream', { question: 'Hello?' });
    assert.equal(result.status, 503);
    assert.match((await result.json()).error, /GEMINI_API_KEY/);
  }));
test('API validates inputs before calling the provider', () =>
  withServer(async (base) => {
    for (const [route, body] of [
      ['analyze-question-stream', { question: 42 }],
      ['transcribe', { data: 'invalid?', mimeType: 'audio/webm' }],
      ['analyze-doc', { data: 'AAAA', mimeType: 'text/html', fileType: 'resume' }],
      ['practice', { question: 'Your experience?', answer: '' }],
    ] as const) {
      const result = await post(base, route, body);
      assert.equal(result.status, 400, route);
    }
  }, provider));
test('API access token and origin checks reject unauthorized requests', () =>
  withServer(
    async (base) => {
      const denied = await post(base, 'detect-question', { transcript: 'Tell me about yourself' });
      assert.equal(denied.status, 401);
      const crossOrigin = await post(
        base,
        'detect-question',
        { transcript: 'Tell me about yourself' },
        { Authorization: 'Bearer secret', Origin: 'https://untrusted.example' },
      );
      assert.equal(crossOrigin.status, 403);
      const accepted = await post(
        base,
        'detect-question',
        { transcript: 'Tell me about yourself' },
        { Authorization: 'Bearer secret' },
      );
      assert.equal(accepted.status, 200);
      assert.equal((await accepted.json()).confidence, 95);
    },
    provider,
    'secret',
  ));
test('answer stream reports actual model, text, usage and explicit completion', () =>
  withServer(async (base) => {
    const result = await post(base, 'analyze-question-stream', {
      question: 'How do you solve problems?',
      speed: 'fast',
    });
    assert.match(result.headers.get('content-type') || '', /text\/event-stream/);
    const body = await result.text();
    assert.match(body, /"type":"meta"/);
    assert.match(body, /An honest answer/);
    assert.match(body, /"type":"done"/);
    assert.match(body, /"inputTokens":0/);
    assert.doesNotMatch(body, /"type":"error"/);
  }, provider));
test('a provider failure after partial output emits error without a misleading done or retry', () => {
  let calls = 0;
  return withServer(
    async (base) => {
      const result = await post(base, 'analyze-question-stream', { question: 'Question?' });
      const body = await result.text();
      assert.match(body, /partial/);
      assert.match(body, /"type":"error"/);
      assert.doesNotMatch(body, /"type":"done"/);
      assert.equal(calls, 1);
    },
    {
      ...provider,
      async stream() {
        calls++;
        return (async function* () {
          yield response('partial');
          throw Object.assign(new Error('unavailable'), { status: 503 });
        })();
      },
    },
  );
});
test('transient failure before text uses fallback and reports its model', () => {
  let calls = 0;
  return withServer(
    async (base) => {
      const result = await post(base, 'analyze-question-stream', {
        question: 'Question?',
        speed: 'deep',
      });
      const body = await result.text();
      assert.match(body, /"type":"notice"/);
      assert.match(body, /"type":"done"/);
      assert.equal(calls, 2);
    },
    {
      ...provider,
      async stream(params) {
        calls++;
        if (calls === 1) throw Object.assign(new Error('unavailable'), { status: 503 });
        return provider.stream(params);
      },
    },
  );
});
test('disconnect aborts upstream generation', () => {
  let upstream: AbortSignal | undefined;
  return withServer(
    async (base) => {
      const controller = new AbortController();
      const result = await post(base, 'analyze-question-stream', { question: 'Question?' });
      const reader = result.body!.getReader();
      await reader.read();
      await reader.cancel();
      for (let i = 0; i < 20 && !upstream?.aborted; i++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(upstream?.aborted, true);
      controller.abort();
    },
    {
      ...provider,
      async stream(params) {
        upstream = params.config?.abortSignal;
        return (async function* () {
          yield response('partial');
          await new Promise<void>((resolve) => {
            if (upstream?.aborted) resolve();
            else upstream?.addEventListener('abort', () => resolve(), { once: true });
          });
        })();
      },
    },
  );
});

test('malformed provider output is a service error rather than blaming valid user input', () =>
  withServer(
    async (base) => {
      const result = await post(base, 'detect-question', { transcript: 'Your recent project?' });
      assert.equal(result.status, 502);
      assert.match((await result.json()).error, /invalid structured response/);
    },
    {
      ...provider,
      async generate() {
        return response('not JSON');
      },
    },
  ));
test('speech endpoint returns playable WAV bytes when provider returns PCM', () =>
  withServer(
    async (base) => {
      const result = await post(base, 'tts', { text: 'Hello' });
      assert.equal(result.status, 200);
      const body = await result.json();
      assert.equal(body.mimeType, 'audio/wav');
      assert.equal(Buffer.from(body.audio, 'base64').toString('ascii', 0, 4), 'RIFF');
    },
    {
      ...provider,
      async generate() {
        const result = new GenerateContentResponse();
        result.candidates = [
          {
            content: {
              parts: [{ inlineData: { data: 'AAAAAA==', mimeType: 'audio/L16;rate=24000' } }],
            },
          },
        ];
        return result;
      },
    },
  ));
test('provider exception details are never leaked to API clients', () =>
  withServer(
    async (base) => {
      const result = await post(base, 'copilot-chat', {
        messages: [{ role: 'user', text: 'Help me prepare' }],
      });
      const body = await result.text();
      assert.equal(result.status, 502);
      assert.doesNotMatch(body, /secret-provider-detail/);
    },
    {
      ...provider,
      async generate() {
        throw new Error('secret-provider-detail');
      },
    },
  ));

test('answer consistency review returns corrections, validated evidence and separate review usage', () =>
  withServer(
    async (base) => {
      const result = await post(base, 'analyze-question-stream', {
        question: 'Describe your contribution',
        context: { resume: 'I led the migration with two teams.' },
        verifyAnswer: true,
      });
      const events = (await result.text())
        .split('\n\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => JSON.parse(line.slice(6)));
      const done = events.find((event) => event.type === 'done');
      assert.equal(done.reviewStatus, 'complete');
      assert.match(done.finalMarkdown, /I led the migration with two teams/);
      assert.equal(done.review.evidence.length, 1);
      assert.equal(done.reviewUsage.inputTokens, 10);
      assert.ok(events.some((event) => event.type === 'phase' && event.phase === 'review'));
    },
    {
      ...provider,
      async generate() {
        const result = response(
          JSON.stringify({
            verdict: 'needs_revision',
            summary: 'Removed unsupported metrics',
            evidence: [
              {
                source: 'resume',
                quote: 'I led the migration with two teams.',
                relevance: 'Candidate statement',
              },
            ],
            concerns: [],
            missingInformation: [],
            revisedDirectAnswer: 'I led the migration with two teams.',
            revisedExampleScript: '',
          }),
        );
        result.usageMetadata = { promptTokenCount: 10, candidatesTokenCount: 20 };
        return result;
      },
    },
  ));
test('review failure preserves the draft with an explicit unavailable review state', () =>
  withServer(
    async (base) => {
      const result = await post(base, 'analyze-question-stream', {
        question: 'Explain your approach',
        verifyAnswer: true,
      });
      const body = await result.text();
      assert.match(body, /"reviewStatus":"unavailable"/);
      assert.match(body, /"type":"done"/);
      assert.doesNotMatch(body, /"type":"error"/);
    },
    {
      ...provider,
      async generate() {
        throw Object.assign(new Error('quota'), { status: 429 });
      },
    },
  ));
test('provider output token limit cannot masquerade as a complete answer', () =>
  withServer(
    async (base) => {
      const result = await post(base, 'analyze-question-stream', {
        question: 'Solve a task',
        verifyAnswer: false,
      });
      const body = await result.text();
      assert.match(body, /"type":"error"/);
      assert.doesNotMatch(body, /"type":"done"/);
    },
    {
      ...provider,
      async stream() {
        return (async function* () {
          const result = response('Partial solution');
          result.candidates![0].finishReason = 'MAX_TOKENS' as never;
          yield result;
        })();
      },
    },
  ));
test('model diagnostics reports metadata without making generation requests', () =>
  withServer(
    async (base) => {
      const result = await post(base, 'diagnostics', {});
      assert.equal(result.status, 200);
      const data = await result.json();
      assert.ok(data.models.every((model: { available: boolean }) => model.available));
      assert.match(data.models[0].message, /quota are not verified/);
    },
    {
      ...provider,
      async generate() {
        throw new Error('Must not generate');
      },
      async inspect(model) {
        return { name: model, supportedActions: ['generateContent'] };
      },
    },
  ));

test('browser credentials are request-scoped across concurrent requests and never returned by health', () => {
  const first = 'test-user-one-credential-12345';
  const second = 'test-user-two-credential-67890';
  return withServer(
    async (base) => {
      const results = await Promise.all(
        [first, second].map(async (key) => {
          const result = await post(
            base,
            'copilot-chat',
            { messages: [{ role: 'user', text: 'Help me answer' }] },
            { 'X-Gemini-API-Key': key },
          );
          return { status: result.status, body: await result.text(), key };
        }),
      );
      for (const result of results) {
        assert.equal(result.status, 200);
        assert.match(result.body, new RegExp(result.key === first ? 'FIRST' : 'SECOND'));
      }
      const health = await fetch(base + '/api/health', { headers: { 'X-Gemini-API-Key': first } });
      const body = await health.text();
      assert.equal(JSON.parse(body).hasApiKey, true);
      assert.ok(!body.includes(first));
      assert.equal((await (await fetch(base + '/api/health')).json()).hasApiKey, false);
      assert.equal(
        (await post(base, 'copilot-chat', { messages: [{ role: 'user', text: 'Help me answer' }] }))
          .status,
        503,
      );
      assert.equal(
        (await fetch(base + '/api/health', { headers: { 'X-Gemini-API-Key': 'bad key' } })).status,
        400,
      );
    },
    undefined,
    '',
    (key) => ({
      ...provider,
      async generate() {
        await new Promise((resolve) => setTimeout(resolve, key === first ? 25 : 5));
        return response(key === first ? 'FIRST' : 'SECOND');
      },
    }),
  );
});
