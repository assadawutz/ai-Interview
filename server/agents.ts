import { agentDefaults, type AgentPlan } from '../shared/agents.js';
export type CatalogModel = {
  id: string;
  pricing?: Record<string, string>;
  architecture?: { output_modalities?: string[] };
  supported_parameters?: string[];
};
export function freeTextModels(models: CatalogModel[]) {
  return models.filter(
    (m) =>
      (m.id.endsWith(':free') || m.id === 'openrouter/free') &&
      Number(m.pricing?.prompt ?? -1) === 0 &&
      Number(m.pricing?.completion ?? -1) === 0 &&
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
let cached: { models: CatalogModel[]; until: number } | undefined;
export async function freeCatalog() {
  if (cached && cached.until > Date.now()) return cached.models;
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Free catalog unavailable.');
  const result = (await response.json()) as { data?: CatalogModel[] };
  if (!Array.isArray(result.data)) throw new Error('Invalid catalog.');
  buildAgentPlan(result.data);
  cached = { models: result.data, until: Date.now() + 300000 };
  return result.data;
}
