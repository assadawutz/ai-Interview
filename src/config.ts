import { z } from 'zod';
const spec = z.object({
  runtime: z.literal('client'),
  timeoutMs: z.number().min(5000).max(300000),
  reviewTimeoutMs: z.number().positive(),
  maxOutputTokens: z.number().int().positive(),
  maxFallbacks: z.literal(1),
  models: z.object({
    fast: z.string(),
    balanced: z.string(),
    deep: z.string(),
    fallback: z.string(),
    transcription: z.string(),
  }),
  design: z.object({
    lime: z.string(),
    purple: z.string(),
    ink: z.string(),
    surface: z.string(),
    border: z.string(),
    radius: z.string(),
  }),
});
/** Reviewed release defaults. No credential may be added to this public config. */
export const appConfig = Object.freeze(
  spec.parse({
    runtime: 'client',
    timeoutMs: 75000,
    reviewTimeoutMs: 20000,
    maxOutputTokens: 4096,
    maxFallbacks: 1,
    models: {
      fast: 'gemini-3.1-flash-lite',
      balanced: 'gemini-3.8-flash',
      deep: 'gemini-4-argon',
      fallback: 'gemini-3.8-flash',
      transcription: 'gemini-3.5-transcribe',
    },
    design: {
      lime: '#d9ef9c',
      purple: '#6544b9',
      ink: '#20222b',
      surface: '#f7f8fa',
      border: '1px',
      radius: '12px',
    },
  }),
);
export function applyDesignConfig() {
  for (const [key, value] of Object.entries(appConfig.design))
    document.documentElement.style.setProperty(`--ds-${key}`, value);
  document.documentElement.dataset.runtime = appConfig.runtime;
}

Object.freeze(appConfig.models);
Object.freeze(appConfig.design);
