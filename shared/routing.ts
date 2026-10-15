import { z } from 'zod';
import { agentDefaults } from './agents.js';
export const routingSchema = z.object({
  agentMode: z.boolean().default(false),
  freeOnly: z.boolean().default(false),
  provider: z.enum(['openrouter', 'groq', 'ollama', 'ollama-cloud']).default('openrouter'),
  model: z
    .string()
    .trim()
    .max(200)
    .regex(/^[A-Za-z0-9_./:@-]*$/)
    .default(''),
  primary: z.enum(['gemini', 'external']).default('gemini'),
  fallback: z.boolean().default(false),
  geminiModel: z
    .string()
    .trim()
    .max(150)
    .regex(/^[A-Za-z0-9_.-]*$/)
    .default(''),
});
export type LLMRouting = z.infer<typeof routingSchema>;
export const defaultRouting = routingSchema.parse({});
export function externalModel(route: LLMRouting) {
  return `external:${route.provider}:${route.model}`;
}

export const freeAgentRouting = routingSchema.parse({
  provider: 'openrouter',
  model: agentDefaults.coach,
  primary: 'external',
  fallback: true,
  freeOnly: true,
  agentMode: true,
});
