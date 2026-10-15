import { test } from 'node:test';
import assert from 'node:assert/strict';
import { externalProvider, ollamaDeploymentSupported } from '../server/llm';
import { routingSchema } from '../shared/routing';
const route = routingSchema.parse({
  provider: 'ollama',
  model: 'fixture:local',
  primary: 'external',
});
test('Ollama adapter sends structured text to its fixed local endpoint without a provider key', async () => {
  const mockFetch: typeof fetch = async (url, init) => {
    assert.equal(String(url), 'http://127.0.0.1:11434/v1/chat/completions');
    assert.equal(new Headers(init?.headers).has('authorization'), false);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'fixture:local');
    assert.match(JSON.stringify(body.messages), /Return only JSON/);
    return Response.json({
      id: 'fixture',
      object: 'chat.completion',
      created: 1,
      model: 'fixture:local',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: '{"reply":"local answer"}' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 4, completion_tokens: 5, total_tokens: 9 },
    });
  };
  const result = await externalProvider(route, 'never-forward-this', mockFetch).generate({
    model: 'external:ollama:fixture:local',
    contents: 'Reply JSON',
    config: { responseMimeType: 'application/json' },
  });
  assert.deepEqual(JSON.parse(result.text!), { reply: 'local answer' });
  assert.equal(result.modelVersion, 'ollama/fixture:local');
  assert.equal(result.usageMetadata?.promptTokenCount, 4);
});
test('Ollama stream preserves text, completion state and usage through the AI SDK', async () => {
  const events = [
    {
      id: 'fixture',
      model: 'fixture:local',
      choices: [
        { index: 0, delta: { role: 'assistant', content: 'Local answer' }, finish_reason: null },
      ],
    },
    {
      id: 'fixture',
      model: 'fixture:local',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 5, total_tokens: 9 },
    },
  ];
  const mockFetch: typeof fetch = async () =>
    new Response(
      events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  const stream = await externalProvider(route, '', mockFetch).stream({
    model: 'external:ollama:fixture:local',
    contents: 'Explain indexes',
  });
  let text = '',
    finish: string | undefined;
  for await (const response of stream) {
    text += response.text || '';
    finish ||= response.candidates?.[0]?.finishReason;
  }
  assert.equal(text, 'Local answer');
  assert.equal(finish, 'STOP');
});
test('external adapter rejects documents and Google tools before making network requests', async () => {
  let calls = 0;
  const mockFetch: typeof fetch = async () => {
    calls++;
    throw new Error('unexpected network');
  };
  const adapter = externalProvider(route, '', mockFetch);
  await assert.rejects(
    adapter.generate({
      model: 'fixture',
      contents: [{ inlineData: { data: 'AAAA', mimeType: 'application/pdf' } }],
    }),
  );
  await assert.rejects(
    adapter.stream({
      model: 'fixture',
      contents: 'Search',
      config: { tools: [{ googleSearch: {} }] },
    }),
  );
  assert.equal(calls, 0);
});

test('cloud deployments do not mistake a localhost Ollama URL for a reachable user computer', () => {
  assert.equal(ollamaDeploymentSupported('1', undefined), false);
  assert.equal(ollamaDeploymentSupported('1', 'http://127.0.0.1:11434'), false);
  assert.equal(ollamaDeploymentSupported('1', 'http://localhost:11434'), false);
  assert.equal(ollamaDeploymentSupported('1', 'http://[::1]:11434'), false);
  assert.equal(ollamaDeploymentSupported('1', 'file:///etc/passwd'), false);
  assert.equal(ollamaDeploymentSupported('1', 'https://trusted-ollama.example'), true);
  assert.equal(ollamaDeploymentSupported(undefined, undefined), true);
});
