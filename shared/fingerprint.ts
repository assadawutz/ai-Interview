import { contextSchema, type CandidateContext, type Settings } from './contracts.js';
export async function fingerprint(value: unknown): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function contextFingerprint(context: CandidateContext, language: 'th' | 'en') {
  return fingerprint({ context: contextSchema.parse(context), language });
}
export function answerFingerprint(
  question: string,
  context: CandidateContext,
  settings: Settings,
  tone: string,
) {
  return fingerprint({
    question,
    context: contextSchema.parse(context),
    language: settings.language,
    speed: settings.speed,
    useSearch: settings.useSearch,
    quickStudy: settings.quickStudy,
    verifyAnswers: settings.verifyAnswers,
    taskType: settings.taskType,
    tone,
  });
}
