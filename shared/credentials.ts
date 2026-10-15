/** Accept common clipboard wrappers; Google, not a local regex, validates credentials. */
export function normalizeGeminiKey(value: string) {
  let key = value
    .trim()
    .replace(/^[\u200B\uFEFF]+|[\u200B\uFEFF]+$/g, '')
    .trim();
  key = key.replace(/^(?:export\s+)?GEMINI_API_KEY\s*=\s*/i, '');
  if (key.length >= 2 && ['"', "'", '`'].includes(key[0]) && key.at(-1) === key[0])
    key = key.slice(1, -1).trim();
  if (key && (key.length > 512 || !/^[\x21-\x7E]+$/.test(key)))
    throw new Error(
      'Paste only the API key value from Google AI Studio, without spaces or line breaks.',
    );
  return key;
}
