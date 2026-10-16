import { agentDefaults, type AgentPlan } from './agents.js';
export type CatalogModel = {
  id: string;
  pricing?: Record<string, string>;
  architecture?: { output_modalities?: string[] };
  supported_parameters?: string[];
};
const zeroPrice = (value: unknown) =>
  ((typeof value === 'string' && value.trim() !== '') || typeof value === 'number') &&
  Number(value) === 0;
export function freeTextModels(models: CatalogModel[]) {
  return models.filter(
    (m) =>
      (m.id.endsWith(':free') || m.id === 'openrouter/free') &&
      zeroPrice(m.pricing?.prompt) &&
      zeroPrice(m.pricing?.completion) &&
      (m.pricing?.request === undefined || zeroPrice(m.pricing.request)) &&
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
