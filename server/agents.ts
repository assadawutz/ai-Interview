import { buildAgentPlan, parseCatalog, type CatalogModel } from '../shared/free-models.js';
export * from '../shared/free-models.js';
let cached: { models: CatalogModel[]; until: number } | undefined;
let loading: Promise<CatalogModel[]> | undefined;
export async function freeCatalog() {
  if (cached && cached.until > Date.now()) return cached.models;
  if (loading) return loading;
  loading = loadCatalog();
  try {
    return await loading;
  } finally {
    loading = undefined;
  }
}
async function loadCatalog() {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Free catalog unavailable.');
  const models = parseCatalog(await response.json());
  buildAgentPlan(models);
  cached = { models, until: Date.now() + 300000 };
  return models;
}
