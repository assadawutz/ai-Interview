import { z } from 'zod';
const spec = z.object({
  runtime: z.enum(['client', 'server']),
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
    yellow: z.string(),
    lime: z.string(),
    purple: z.string(),
    ink: z.string(),
    surface: z.string(),
    border: z.string(),
    radius: z.string(),
    duration: z.string(),
    easing: z.string(),
    drift: z.string(),
    connection: z.string(),
    float: z.string(),
  }),
});
/** Reviewed release defaults. No credential may be added to this public config. */
export const appConfig = Object.freeze(
  spec.parse({
    runtime: import.meta.env?.VITE_RUNTIME_MODE === 'server' ? 'server' : 'client',
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
      yellow: '#ffe45c',
      lime: '#caff45',
      purple: '#7042cc',
      ink: '#171323',
      surface: '#fbf9ff',
      border: '2px',
      radius: '12px',
      duration: '180ms',
      easing: 'cubic-bezier(.2,.8,.2,1)',
      drift: '20s',
      connection: '18s',
      float: '8s',
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
