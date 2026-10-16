import { appConfig } from '../config';
import { sourceSchema, usageSchema, answerReviewSchema } from '../../shared/contracts';
import { z } from 'zod';
import { normalizeGeminiKey } from '../../shared/credentials';
import { routingSchema, defaultRouting, type LLMRouting } from '../../shared/routing';
let accessToken = '';
const GEMINI_KEY_STORAGE = 'interview-pulse:gemini-key';
export function getGeminiKey() {
  try {
    return (
      sessionStorage.getItem(GEMINI_KEY_STORAGE) || localStorage.getItem(GEMINI_KEY_STORAGE) || ''
    );
  } catch {
    return '';
  }
}
export function remembersGeminiKey() {
  try {
    return !!localStorage.getItem(GEMINI_KEY_STORAGE);
  } catch {
    return false;
  }
}
export function saveGeminiKey(value: string, remember = false) {
  const key = normalizeGeminiKey(value);
  if (!key) throw new Error('Enter your Gemini API key.');
  // Write the destination first so a storage failure cannot erase the existing key.
  const destination = remember ? localStorage : sessionStorage;
  if (key) destination.setItem(GEMINI_KEY_STORAGE, key);
  else destination.removeItem(GEMINI_KEY_STORAGE);
  (remember ? sessionStorage : localStorage).removeItem(GEMINI_KEY_STORAGE);
}
export function clearGeminiKey() {
  sessionStorage.removeItem(GEMINI_KEY_STORAGE);
  localStorage.removeItem(GEMINI_KEY_STORAGE);
}
const LLM_STORAGE = 'interview-pulse:llm-connection';
const LLM_VAULT = 'interview-pulse:provider-keys:v1';
export function storedProviderKey(provider: LLMRouting['provider']) {
  try {
    return (
      z.record(z.string(), z.string()).parse(JSON.parse(localStorage.getItem(LLM_VAULT) || '{}'))[
        provider
      ] || ''
    );
  } catch {
    return '';
  }
}
export function remembersLLMConnection() {
  try {
    return !!localStorage.getItem(LLM_STORAGE);
  } catch {
    return false;
  }
}
export function getLLMConnection(): { route: LLMRouting; key: string } {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(LLM_STORAGE) || localStorage.getItem(LLM_STORAGE) || '{}',
    );
    return {
      route: routingSchema.parse(value.route || {}),
      key:
        typeof value.key === 'string'
          ? value.key
          : storedProviderKey(routingSchema.parse(value.route || {}).provider),
    };
  } catch {
    return { route: defaultRouting, key: '' };
  }
}
export function saveLLMConnection(route: LLMRouting, value: string, remember = false) {
  const parsed = routingSchema.parse(route);
  const key = parsed.provider === 'ollama' ? '' : normalizeGeminiKey(value);
  if (
    (parsed.primary === 'external' || parsed.fallback) &&
    (!parsed.model || (!key && parsed.provider !== 'ollama'))
  )
    throw new Error('Enter the provider model ID and API key (Ollama does not require a key).');
  if (remember) {
    let vault: Record<string, string> = {};
    try {
      vault = z
        .record(z.string(), z.string())
        .parse(JSON.parse(localStorage.getItem(LLM_VAULT) || '{}'));
    } catch {
      /* Recover corrupt credential metadata without discarding the new key. */
    }
    localStorage.setItem(LLM_VAULT, JSON.stringify({ ...vault, [parsed.provider]: key }));
    localStorage.setItem(LLM_STORAGE, JSON.stringify({ route: parsed }));
    sessionStorage.removeItem(LLM_STORAGE);
  } else {
    sessionStorage.setItem(LLM_STORAGE, JSON.stringify({ route: parsed, key }));
    localStorage.removeItem(LLM_STORAGE);
    localStorage.removeItem(LLM_VAULT);
  }
}
export function clearLLMConnection() {
  sessionStorage.removeItem(LLM_STORAGE);
  localStorage.removeItem(LLM_STORAGE);
  localStorage.removeItem(LLM_VAULT);
}
function routingHeaders() {
  const { route, key } = getLLMConnection();
  return { 'X-LLM-Config': JSON.stringify(route), ...(key ? { 'X-LLM-API-Key': key } : {}) };
}
let requestTimeoutMs = appConfig.timeoutMs;
export function setRequestTimeoutMs(value?: number) {
  if (value !== undefined && Number.isFinite(value) && value >= 5000 && value <= 300000)
    requestTimeoutMs = value;
}
export function setAccessToken(value: string) {
  accessToken = value;
}
export function getAccessToken() {
  return accessToken;
}
export const headers = () => ({
  'Content-Type': 'application/json',
  ...routingHeaders(),
  ...(getGeminiKey() ? { 'X-Gemini-API-Key': getGeminiKey() } : {}),
  ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
});
export async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  if (appConfig.runtime === 'client') {
    const saved = getLLMConnection();
    const geminiKey = getGeminiKey();
    const { ClientRuntime, clientError } = await import('./client-runtime');
    const connection = {
      route: extraHeaders?.['X-LLM-Config']
        ? routingSchema.parse(JSON.parse(extraHeaders['X-LLM-Config']))
        : saved.route,
      key: extraHeaders?.['X-LLM-API-Key'] ?? saved.key,
      geminiKey,
    };
    try {
      return (await new ClientRuntime(connection).request(
        path,
        body,
        signal
          ? AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)])
          : AbortSignal.timeout(requestTimeoutMs),
      )) as T;
    } catch (e) {
      throw clientError(e);
    }
  }
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...headers(), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)])
      : AbortSignal.timeout(requestTimeoutMs),
  });
  const data = await response.json().catch(() => ({ error: 'Invalid response from server.' }));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}
const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('meta'), model: z.string() }),
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('notice'), message: z.string() }),
  z.object({ type: z.literal('phase'), phase: z.enum(['generation', 'review']) }),
  z.object({ type: z.literal('error'), error: z.string() }),
  z.object({
    type: z.literal('done'),
    model: z.string(),
    usage: usageSchema,
    sources: z.array(sourceSchema),
    elapsedMs: z.number(),
    estimatedCostUsd: z.number().optional(),
    firstTokenMs: z.number().optional(),
    reviewStatus: z.enum(['complete', 'unavailable', 'skipped']).default('skipped'),
    review: answerReviewSchema.optional(),
    reviewModel: z.string().optional(),
    reviewUsage: usageSchema.optional(),
    reviewCostUsd: z.number().optional(),
    finalMarkdown: z.string().optional(),
  }),
]);
export type StreamEvent = z.infer<typeof eventSchema>;
/** Handles CRLF, split UTF-8 bytes, multi-line data and explicit completion. */
export async function readEvents(
  response: Response,
  receive: (event: StreamEvent) => void,
  signal?: AbortSignal,
) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Request failed (${response.status}).`);
  }
  if (!response.headers.get('Content-Type')?.includes('text/event-stream') || !response.body)
    throw new Error('Expected an answer stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '',
    completed = false;
  const parse = (block: string) => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      throw new Error('Invalid answer stream. Please retry.');
    }
    const result = eventSchema.safeParse(json);
    if (!result.success) throw new Error('Invalid answer stream. Please retry.');
    if (result.data.type === 'error') throw new Error(result.data.error);
    if (result.data.type === 'done') completed = true;
    receive(result.data);
  };
  try {
    while (!completed) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      // A CR may arrive separately from the following LF.
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        parse(block);
        if (completed) break;
      }
      if (done) {
        if (!completed && buffer.trim()) parse(buffer);
        break;
      }
    }
    if (!completed) throw new Error('Connection ended before the answer completed. Please retry.');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function streamAnswer(
  body: unknown,
  signal: AbortSignal,
  receive: (event: StreamEvent) => void,
) {
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]);
  if (appConfig.runtime === 'client') {
    const saved = getLLMConnection();
    const geminiKey = getGeminiKey();
    const { ClientRuntime, clientError } = await import('./client-runtime');
    try {
      return await new ClientRuntime({ ...saved, geminiKey }).stream(body, timeout, receive);
    } catch (e) {
      throw clientError(e);
    }
  }
  const response = await fetch('/api/analyze-question-stream', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    signal: timeout,
  });
  return readEvents(response, receive, timeout);
}
export async function fileBase64(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
