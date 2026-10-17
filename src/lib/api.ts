import { appConfig } from '../config';
import { sourceSchema, usageSchema, answerReviewSchema } from '../../shared/contracts';
import { z } from 'zod';
import { normalizeGeminiKey } from '../../shared/credentials';
import { routingSchema, defaultRouting, type LLMRouting } from '../../shared/routing';
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
let requestTimeoutMs = appConfig.timeoutMs;
export function setRequestTimeoutMs(value?: number) {
  if (value !== undefined && Number.isFinite(value) && value >= 5000 && value <= 300000)
    requestTimeoutMs = value;
}
export async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  override?: { route: LLMRouting; key: string },
): Promise<T> {
  {
    const saved = getLLMConnection();
    const geminiKey = getGeminiKey();
    const { ClientRuntime, clientError } = await import('./client-runtime');
    const connection = {
      route: override?.route ?? saved.route,
      key: override?.key ?? saved.key,
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
export async function streamAnswer(
  body: unknown,
  signal: AbortSignal,
  receive: (event: StreamEvent) => void,
) {
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]);
  {
    const saved = getLLMConnection();
    const geminiKey = getGeminiKey();
    const { ClientRuntime, clientError } = await import('./client-runtime');
    try {
      return await new ClientRuntime({ ...saved, geminiKey }).stream(body, timeout, receive);
    } catch (e) {
      throw clientError(e);
    }
  }
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
