import 'dotenv/config';
import { z } from 'zod';

const pricingSchema = z.record(
  z.string(),
  z.object({ input: z.number().nonnegative(), output: z.number().nonnegative() }),
);
function readPricing() {
  try {
    return pricingSchema.parse(JSON.parse(process.env.AI_MODEL_PRICING_JSON || '{}'));
  } catch {
    throw new Error(
      'AI_MODEL_PRICING_JSON must map model IDs to nonnegative input/output prices per million tokens.',
    );
  }
}
const appUrl = process.env.APP_URL || '';
if (appUrl && !z.url({ protocol: /^https?$/ }).safeParse(appUrl).success)
  throw new Error('APP_URL must be a valid public HTTP(S) origin.');

const number = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
export const config = {
  port: number('PORT', 3000),
  host: process.env.HOST || '0.0.0.0',
  apiKey: process.env.GEMINI_API_KEY?.trim() || '',
  accessToken: process.env.APP_ACCESS_TOKEN || '',
  appUrl,
  models: {
    fast: process.env.GEMINI_MODEL_FAST || 'gemini-3.1-flash-lite',
    balanced: process.env.GEMINI_MODEL_BALANCED || 'gemini-3.8-flash',
    deep: process.env.GEMINI_MODEL_DEEP || 'gemini-4-argon',
    fallback: process.env.GEMINI_MODEL_FALLBACK || 'gemini-3.8-flash',
    transcription: process.env.GEMINI_MODEL_TRANSCRIPTION || 'gemini-3.5-transcribe',
    tts: process.env.GEMINI_MODEL_TTS || 'gemini-3.8-flash-tts',
  },
  timeoutMs: number('AI_TIMEOUT_MS', 60000),
  rateLimit: number('API_RATE_LIMIT', 60),
  pricing: readPricing(),
  maxOutputTokens: number('AI_MAX_OUTPUT_TOKENS', 4096),
};
export function hasApiKey() {
  return !!config.apiKey && !/^(MY_|YOUR_|replace)/i.test(config.apiKey);
}

export function estimateCost(
  model: string,
  usage: { inputTokens: number; outputTokens: number; thinkingTokens: number },
) {
  const prices = config.pricing[model];
  return prices
    ? (usage.inputTokens * prices.input +
        (usage.outputTokens + usage.thinkingTokens) * prices.output) /
        1e6
    : undefined;
}
