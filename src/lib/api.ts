import { sourceSchema, usageSchema, answerReviewSchema } from '../../shared/contracts';
import { z } from 'zod';
let accessToken = '';
let requestTimeoutMs = 75000;
export function setRequestTimeoutMs(value?: number) {
  if (value !== undefined && Number.isFinite(value) && value >= 5000 && value <= 300000)
    requestTimeoutMs = value;
}
export function setAccessToken(value: string) {
  accessToken = value;
}
export function getAccessToken() {
  return accessToken;
}
export const headers = () => ({
  'Content-Type': 'application/json',
  ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
});
export async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)])
      : AbortSignal.timeout(requestTimeoutMs),
  });
  const data = await response.json().catch(() => ({ error: 'Invalid response from server.' }));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}
const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('meta'), model: z.string() }),
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('notice'), message: z.string() }),
  z.object({ type: z.literal('phase'), phase: z.enum(['generation', 'review']) }),
  z.object({ type: z.literal('error'), error: z.string() }),
  z.object({
    type: z.literal('done'),
    model: z.string(),
    usage: usageSchema,
    sources: z.array(sourceSchema),
    elapsedMs: z.number(),
    estimatedCostUsd: z.number().optional(),
    firstTokenMs: z.number().optional(),
    reviewStatus: z.enum(['complete', 'unavailable', 'skipped']).default('skipped'),
    review: answerReviewSchema.optional(),
    reviewModel: z.string().optional(),
    reviewUsage: usageSchema.optional(),
    reviewCostUsd: z.number().optional(),
    finalMarkdown: z.string().optional(),
  }),
]);
export type StreamEvent = z.infer<typeof eventSchema>;
/** Handles CRLF, split UTF-8 bytes, multi-line data and explicit completion. */
export async function readEvents(
  response: Response,
  receive: (event: StreamEvent) => void,
  signal?: AbortSignal,
) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Request failed (${response.status}).`);
  }
  if (!response.headers.get('Content-Type')?.includes('text/event-stream') || !response.body)
    throw new Error('Expected an answer stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '',
    completed = false;
  const parse = (block: string) => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      throw new Error('Invalid answer stream. Please retry.');
    }
    const result = eventSchema.safeParse(json);
    if (!result.success) throw new Error('Invalid answer stream. Please retry.');
    if (result.data.type === 'error') throw new Error(result.data.error);
    if (result.data.type === 'done') completed = true;
    receive(result.data);
  };
  try {
    while (!completed) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      // A CR may arrive separately from the following LF.
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        parse(block);
        if (completed) break;
      }
      if (done) {
        if (!completed && buffer.trim()) parse(buffer);
        break;
      }
    }
    if (!completed) throw new Error('Connection ended before the answer completed. Please retry.');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function streamAnswer(
  body: unknown,
  signal: AbortSignal,
  receive: (event: StreamEvent) => void,
) {
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]);
  const response = await fetch('/api/analyze-question-stream', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    signal: timeout,
  });
  return readEvents(response, receive, timeout);
}
export async function fileBase64(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
