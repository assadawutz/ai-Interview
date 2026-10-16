import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCapabilities } from '../shared/capabilities';
const base = {
  native: true,
  external: false,
  primary: 'gemini' as const,
  fallback: false,
  freeOnly: false,
  catalogReady: false,
};
test('free-only readiness requires its own credential and verified catalog even with Gemini configured', () => {
  assert.equal(resolveCapabilities({ ...base, freeOnly: true }).text, false);
  assert.equal(resolveCapabilities({ ...base, freeOnly: true, external: true }).text, false);
  const ready = resolveCapabilities({
    ...base,
    freeOnly: true,
    external: true,
    catalogReady: true,
  });
  assert.equal(ready.text, true);
  for (const capability of ['tts', 'search', 'transcription', 'documents'] as const)
    assert.equal(ready[capability], false);
});
test('external primary cannot silently fall back to Gemini when its key is missing', () => {
  assert.equal(resolveCapabilities({ ...base, primary: 'external' }).text, false);
  assert.equal(
    resolveCapabilities({ ...base, native: false, external: true, fallback: true }).text,
    true,
  );
  assert.equal(resolveCapabilities({ ...base }).search, true);
});
