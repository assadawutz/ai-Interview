import { test } from 'node:test';
import assert from 'node:assert/strict';
import { externalProvider, listExternalModels } from '../shared/llm';
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
    assert.match(JSON.stringify(body.messages), /properties/);
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
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: {
        type: 'object',
        properties: { reply: { type: 'string' } },
        required: ['reply'],
      },
    },
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

test('Ollama Cloud uses the HTTPS cloud endpoint and its own provider credential', async () => {
  const cloud = routingSchema.parse({
    provider: 'ollama-cloud',
    model: 'fixture-cloud',
    primary: 'external',
  });
  const transport: typeof fetch = async (url, init) => {
    assert.equal(String(url), 'https://ollama.com/v1/chat/completions');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-ollama-cloud-key');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'fixture-cloud');
    return Response.json({
      id: 'fixture',
      object: 'chat.completion',
      created: 1,
      model: 'fixture-cloud',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Cloud answer' },
          finish_reason: 'stop',
        },
      ],
    });
  };
  const answer = await externalProvider(cloud, 'test-ollama-cloud-key', transport).generate({
    model: 'external:ollama-cloud:fixture-cloud',
    contents: 'Explain indexes',
  });
  assert.equal(answer.text, 'Cloud answer');
  assert.equal(answer.modelVersion, 'ollama-cloud/fixture-cloud');
});

test('model catalog uses only the selected fixed provider endpoint and returns safe IDs', async () => {
  const cloud = routingSchema.parse({ provider: 'ollama-cloud' });
  const transport: typeof fetch = async (url, init) => {
    assert.equal(String(url), 'https://ollama.com/v1/models');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer catalog-key');
    return Response.json({
      data: [
        { id: 'fixture:cloud' },
        { id: 'fixture:cloud' },
        null,
        { id: 'bad\nname' },
        { id: 'alpha:cloud' },
      ],
    });
  };
  assert.deepEqual(
    await listExternalModels(cloud, 'catalog-key', new AbortController().signal, transport),
    ['alpha:cloud', 'fixture:cloud'],
  );
});
