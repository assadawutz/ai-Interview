import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText, Output } from 'ai';
import { GenerateContentResponse, type GenerateContentParameters, type Model } from '@google/genai';
import type { Provider } from './app.js';
import type { LLMRouting } from '../shared/routing.js';
const endpoints = {
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  ollama: `${(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')}/v1`,
};
export function ollamaDeploymentSupported(
  vercel = process.env.VERCEL,
  base = process.env.OLLAMA_BASE_URL,
) {
  if (vercel !== '1') return true;
  try {
    const url = new URL(base || '');
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !/^(?:localhost|127\.|\[::1\])/.test(url.hostname) &&
      !url.hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}
export function textOnly(params: GenerateContentParameters) {
  return (
    !params.config?.tools?.length &&
    !/"(?:inlineData|fileData)"\s*:/.test(JSON.stringify(params.contents))
  );
}
function result(
  text: string,
  model: string,
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    outputTokenDetails?: { reasoningTokens?: number };
  },
  reason?: string,
) {
  const response = new GenerateContentResponse();
  response.modelVersion = model;
  response.candidates = [
    {
      content: { parts: [{ text }] },
      ...(reason ? { finishReason: (reason === 'stop' ? 'STOP' : 'MAX_TOKENS') as never } : {}),
    },
  ];
  if (usage)
    response.usageMetadata = {
      promptTokenCount: usage.inputTokens,
      candidatesTokenCount:
        usage.outputTokens === undefined
          ? undefined
          : Math.max(0, usage.outputTokens - (usage.outputTokenDetails?.reasoningTokens || 0)),
      thoughtsTokenCount: usage.outputTokenDetails?.reasoningTokens,
    };
  return response;
}
export function externalProvider(
  route: LLMRouting,
  key: string,
  transport: typeof fetch = fetch,
): Provider {
  const compatible = createOpenAICompatible({
    name: route.provider,
    baseURL: endpoints[route.provider],
    apiKey: route.provider === 'ollama' ? undefined : key,
    includeUsage: true,
    fetch: transport,
  });
  const label = `${route.provider}/${route.model}`;
  function options(params: GenerateContentParameters) {
    if (!textOnly(params))
      throw Object.assign(
        new Error(
          'External text routes do not support Google Search, documents, or audio. Disable Search or use Gemini for this feature.',
        ),
        { status: 400 },
      );
    const system =
      typeof params.config?.systemInstruction === 'string'
        ? params.config.systemInstruction
        : JSON.stringify(params.config?.systemInstruction || '');
    return {
      model: compatible.chatModel(route.model),
      system:
        system +
        (params.config?.responseMimeType === 'application/json'
          ? `\nReturn only JSON matching this schema: ${JSON.stringify(params.config.responseSchema || {})}`
          : ''),
      prompt:
        typeof params.contents === 'string' ? params.contents : JSON.stringify(params.contents),
      maxOutputTokens: params.config?.maxOutputTokens,
      abortSignal: params.config?.abortSignal,
      maxRetries: 0,
    };
  }
  return {
    async generate(params) {
      const answer = await generateText({
        ...options(params),
        ...(params.config?.responseMimeType === 'application/json'
          ? { output: Output.json() }
          : {}),
      });
      return result(answer.text, label, answer.totalUsage, answer.finishReason);
    },
    async stream(params) {
      const answer = streamText(options(params));
      return (async function* () {
        for await (const part of answer.fullStream) {
          if (part.type === 'error') throw part.error;
          if (part.type === 'text-delta') yield result(part.text, label);
        }
        yield result('', label, await answer.totalUsage, await answer.finishReason);
      })();
    },
    async inspect(_model, signal) {
      const response = await transport(`${endpoints[route.provider]}/models`, {
        headers: route.provider === 'ollama' ? {} : { Authorization: `Bearer ${key}` },
        signal,
      });
      if (!response.ok)
        throw Object.assign(new Error('Provider model lookup failed.'), {
          status: response.status,
        });
      const data = (await response.json()) as { data?: { id: string }[] };
      if (!data.data?.some((item) => item.id === route.model))
        throw Object.assign(new Error('Model unavailable.'), { status: 404 });
      return { name: label, supportedActions: ['generateContent'] } as Model;
    },
  };
}
