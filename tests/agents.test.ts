import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentPlan, freeTextModels } from '../server/agents';
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
  const bad = [
    { ...catalog[0], pricing: { prompt: '0.01', completion: '0' } },
    { ...catalog[1], pricing: undefined },
    { ...catalog[2], architecture: { output_modalities: ['audio'] } },
    { ...catalog[3], id: 'priced/model' },
  ];
  assert.equal(freeTextModels(bad).length, 0);
  assert.throws(() => buildAgentPlan(bad));
});
test('retired defaults are replaced only by verified free structured-text alternatives', () => {
  const model = { ...catalog[0], id: 'other/model:free' };
  assert.ok(Object.values(buildAgentPlan([model])).every((id) => id === model.id));
});
