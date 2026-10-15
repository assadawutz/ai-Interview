import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGeminiKey } from '../shared/credentials';
test('credential paste accepts quotes, environment assignments and provider key formats without guessing their length', () => {
  for (const value of [
    ' token.value+/= ',
    '"token.value+/="',
    "'token.value+/='",
    'GEMINI_API_KEY="token.value+/="',
    "export GEMINI_API_KEY='token.value+/='",
    '\u200Btoken.value+/=\u200B',
  ])
    assert.equal(normalizeGeminiKey(value), 'token.value+/=');
  assert.equal(normalizeGeminiKey(''), '');
  assert.throws(() => normalizeGeminiKey('not a key'));
  assert.throws(() => normalizeGeminiKey('line\nbreak'));
  assert.throws(() => normalizeGeminiKey('x'.repeat(513)));
});
