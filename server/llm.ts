import {
  externalProvider as createProvider,
  listExternalModels as listModels,
} from '../shared/llm.js';
import type { LLMRouting } from '../shared/routing.js';
export { textOnly } from '../shared/llm.js';
const localURL = () =>
  `${(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')}/v1`;
export const externalProvider = (route: LLMRouting, key: string, transport: typeof fetch = fetch) =>
  createProvider(route, key, transport, route.provider === 'ollama' ? localURL() : undefined);
export const listExternalModels = (
  route: LLMRouting,
  key: string,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
) =>
  listModels(route, key, signal, transport, route.provider === 'ollama' ? localURL() : undefined);
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
