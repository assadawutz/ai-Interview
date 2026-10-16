import { z } from 'zod';
import { agentDefaults, type AgentPlan } from './agents.js';
export type CatalogModel = {
  id: string;
  pricing?: Record<string, unknown>;
  architecture?: { output_modalities?: string[] };
  supported_parameters?: string[];
};
const zeroPrice = (value: unknown) =>
  ((typeof value === 'string' && value.trim() !== '') || typeof value === 'number') &&
  Number(value) === 0;
const optionalTextPrices = [
  'request',
  'internal_reasoning',
  'input_cache_read',
  'input_cache_write',
  'input_cache_write_1h',
];
const zeroTextOverrides = (value: unknown) =>
  value === undefined ||
  (Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        ['prompt', 'completion', ...optionalTextPrices].every(
          (key) => item[key] === undefined || zeroPrice(item[key]),
        ),
    ));
/** Validate model records independently; unrelated pricing metadata is not a token price. */
export function parseCatalog(value: unknown): CatalogModel[] {
  const records = z.object({ data: z.array(z.unknown()).max(10000) }).parse(value).data;
  const model = z.object({
    id: z.string().regex(/^[A-Za-z0-9_./:@-]{1,200}$/),
    pricing: z.record(z.string(), z.unknown()).optional(),
    supported_parameters: z.array(z.string()).optional(),
    architecture: z.object({ output_modalities: z.array(z.string()).optional() }).optional(),
  });
  return records.flatMap((record) => {
    const parsed = model.safeParse(record);
    return parsed.success ? [parsed.data] : [];
  });
}
export function freeTextModels(models: CatalogModel[]) {
  return models.filter(
    (m) =>
      (m.id.endsWith(':free') || m.id === 'openrouter/free') &&
      zeroPrice(m.pricing?.prompt) &&
      zeroPrice(m.pricing?.completion) &&
      optionalTextPrices.every(
        (key) => m.pricing?.[key] === undefined || zeroPrice(m.pricing[key]),
      ) &&
      zeroTextOverrides(m.pricing?.overrides) &&
      (!m.architecture?.output_modalities || m.architecture.output_modalities.includes('text')),
  );
}
export function buildAgentPlan(models: CatalogModel[]): AgentPlan {
  const free = freeTextModels(models);
  const structured = free.filter((m) => m.supported_parameters?.includes('response_format'));
  if (!structured.length) throw new Error('No verified free structured-text models available.');
  const pick = (id: string, pool = structured) => pool.find((m) => m.id === id)?.id || pool[0].id;
  const fallback = free.find((m) => m.id === agentDefaults.fallback)?.id || structured.at(-1)!.id;
  return {
    detector: pick(agentDefaults.detector),
    coach: pick(agentDefaults.coach),
    specialist: pick(agentDefaults.specialist),
    reviewer: pick(agentDefaults.reviewer),
    fallback,
  };
}
