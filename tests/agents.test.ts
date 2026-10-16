import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentPlan, freeTextModels, parseCatalog, type CatalogModel } from '../server/agents';
import { agentDefaults } from '../shared/agents';
const catalog = Object.values(agentDefaults).map((id) => ({
  id,
  pricing: { prompt: '0', completion: '0' },
  supported_parameters: ['response_format'],
  architecture: { output_modalities: ['text'] },
}));
test('agents assign independent defaults to detection, coaching, specialist and review with a free backup', () => {
  assert.deepEqual(buildAgentPlan(catalog), agentDefaults);
});
test('free selection rejects priced aliases, missing pricing and non-text models', () => {
  const bad: CatalogModel[] = [
    { ...catalog[0], pricing: { prompt: '0.01', completion: '0' } },
    { ...catalog[1], pricing: undefined },
    { ...catalog[2], architecture: { output_modalities: ['audio'] } },
    { ...catalog[3], id: 'priced/model' },
    { ...catalog[0], pricing: { prompt: '', completion: '0' } },
    { ...catalog[0], pricing: { prompt: ' ', completion: '0' } },
    { ...catalog[0], pricing: { prompt: '0', completion: '0', request: '0.01' } },
  ];
  assert.equal(freeTextModels(bad).length, 0);
  assert.throws(() => buildAgentPlan(bad));
});
test('retired defaults are replaced only by verified free structured-text alternatives', () => {
  const model = { ...catalog[0], id: 'other/model:free' };
  assert.ok(Object.values(buildAgentPlan([model])).every((id) => id === model.id));
});

test('catalog accepts tier metadata but rejects any chargeable free-model tier or cache price', () => {
  const models = parseCatalog({
    data: [
      {
        ...catalog[0],
        pricing: {
          prompt: '0',
          completion: '0',
          overrides: [{ min_prompt_tokens: 100000, prompt: '0' }],
        },
      },
      {
        ...catalog[1],
        pricing: { prompt: '0', completion: '0', overrides: [{ prompt: '0.001' }] },
      },
      { ...catalog[2], pricing: { prompt: '0', completion: '0', input_cache_read: '0.001' } },
      { id: 42 },
    ],
  });
  assert.equal(models.length, 3);
  assert.deepEqual(
    freeTextModels(models).map((m) => m.id),
    [catalog[0].id],
  );
});
