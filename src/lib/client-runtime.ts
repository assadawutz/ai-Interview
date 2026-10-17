import { type GenerateContentParameters, type GenerateContentResponse } from '@google/genai';
import { z } from 'zod';
import { appConfig } from '../config';
import {
  buildAgentPlan,
  freeTextModels,
  parseCatalog,
  type CatalogModel,
} from '../../shared/free-models';
import { needsSpecialist, type AgentPlan } from '../../shared/agents';
import { routingSchema, type LLMRouting } from '../../shared/routing';
import { resolveCapabilities } from '../../shared/capabilities';
import {
  answerReviewSchema,
  detectionSchema,
  sourceSchema,
  type Usage,
} from '../../shared/contracts';
import { answerBody, binaryBody, detectBody, searchBody, text } from '../../shared/requests';
import { safety, coachPrompt, reviewPrompt } from '../../shared/prompts';
import { checkEvidence, replaceSection } from '../../shared/quality';
import { answerSections, sectionHeaders } from '../../shared/markdown';
import type { Provider } from '../../shared/provider';
import type { StreamEvent } from './api';
export type Connection = { route: LLMRouting; key: string; geminiKey: string };
type Role = 'detector' | 'coach' | 'specialist' | 'reviewer';
let catalogCache: { data: CatalogModel[]; until: number } | undefined;
let catalogPending: Promise<CatalogModel[]> | undefined;
const cooldowns = new Map<string, number>();
const statusOf = (e: unknown) =>
  Number(
    e && typeof e === 'object'
      ? 'status' in e
        ? e.status
        : 'statusCode' in e
          ? e.statusCode
          : 'code' in e
            ? e.code
            : 0
      : 0,
  );
const dailyLimit = (e: unknown) =>
  /per.day|daily|credits|billing|insufficient_quota/i.test(e instanceof Error ? e.message : '');
export function clientError(e: unknown): Error {
  if (e instanceof z.ZodError)
    return new Error('Invalid input or model response. Review the fields and retry.');
  if (e instanceof DOMException && e.name === 'AbortError') return e;
  if (e instanceof Error && e.name === 'TimeoutError')
    return new Error('AI request timed out. Retry or choose another provider.');
  const status = statusOf(e);
  if (status === 401 || status === 403)
    return new Error(
      'Provider rejected the key or browser origin. Check credentials, model access and CORS.',
    );
  if (status === 429)
    return new Error(
      'Provider quota reached. Try an independent provider or local Ollama; daily account quota cannot be bypassed.',
    );
  if (e instanceof TypeError)
    return new Error(
      'Provider connection blocked or unavailable. Check network, CORS and local Ollama origin permissions.',
    );
  return new Error(
    e instanceof RuntimeError
      ? e.message
      : 'AI provider could not complete this request. Retry or choose another provider.',
  );
}
class RuntimeError extends Error {}
async function catalog(signal: AbortSignal) {
  if (catalogCache && catalogCache.until > Date.now()) return catalogCache.data;
  if (!catalogPending) {
    catalogPending = (async () => {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        signal: AbortSignal.timeout(10000),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok)
        throw new RuntimeError('Free model catalog unavailable. Paid fallback is disabled.');
      const data = parseCatalog(await response.json());
      buildAgentPlan(data);
      catalogCache = { data, until: Date.now() + 300000 };
      return data;
    })().finally(() => {
      catalogPending = undefined;
    });
  }
  const pending = catalogPending;
  return new Promise<CatalogModel[]>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(
      (data) => {
        signal.removeEventListener('abort', abort);
        if (!signal.aborted) resolve(data);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}
function usage(response: GenerateContentResponse): Usage {
  return {
    inputTokens: response.usageMetadata?.promptTokenCount || 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
    thinkingTokens: response.usageMetadata?.thoughtsTokenCount || 0,
  };
}
function sources(response: GenerateContentResponse) {
  return (response.candidates?.[0]?.groundingMetadata?.groundingChunks || []).flatMap((c) => {
    const parsed = sourceSchema.safeParse({ title: c.web?.title || 'Source', uri: c.web?.uri });
    return parsed.success ? [parsed.data] : [];
  });
}
function structured<T>(schema: z.ZodType<T>, response: GenerateContentResponse): T {
  const raw = (response.text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    throw new RuntimeError(
      'The model returned invalid structured data. Retry or choose a model with JSON support.',
    );
  }
}
/** A request owns an immutable credential snapshot; credentials never enter config or exports. */
export class ClientRuntime {
  readonly connection: Connection;
  private plan?: AgentPlan;
  private native?: Provider;
  constructor(
    connection: Connection,
    private readonly factory?: (model: string) => Provider,
  ) {
    this.connection = Object.freeze({
      ...connection,
      route: Object.freeze(routingSchema.parse(connection.route)),
    });
  }
  private get freeOnly() {
    return this.connection.route.freeOnly || this.connection.route.agentMode;
  }
  private get externalReady() {
    const { route, key } = this.connection;
    return (
      !!route.model &&
      (route.provider === 'ollama' || !!key) &&
      (route.primary === 'external' || route.fallback)
    );
  }
  private async initialize(signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.freeOnly) {
      if (this.connection.route.provider !== 'openrouter')
        throw new RuntimeError(
          'Free agents require OpenRouter. Disable free-only mode for another provider.',
        );
      if (!this.connection.key) throw new RuntimeError('Add an OpenRouter key in LLM settings.');
      this.plan = buildAgentPlan(await catalog(signal));
    }
  }
  private model(role: Role, speed: 'fast' | 'balanced' | 'deep' = 'balanced', native = false) {
    const { route, geminiKey } = this.connection;
    if (native) {
      if (this.freeOnly || !geminiKey)
        throw new RuntimeError('This feature requires Gemini with free-only mode disabled.');
      return route.geminiModel || appConfig.models[speed];
    }
    if (this.plan) return `external:openrouter:${this.plan[role]}`;
    if (
      route.primary === 'external' ||
      (route.fallback &&
        this.externalReady &&
        (!geminiKey || (cooldowns.get(geminiKey) || 0) > Date.now()))
    ) {
      if (!this.externalReady)
        throw new RuntimeError('Configure the selected provider key and model.');
      return `external:${route.provider}:${route.model}`;
    }
    if (!geminiKey)
      throw new RuntimeError('Connect Gemini or configure an independent LLM in System.');
    return route.geminiModel || appConfig.models[speed];
  }
  private async provider(model: string): Promise<Provider> {
    if (this.factory) return this.factory(model);
    if (model.startsWith('external:')) {
      const { externalProvider } = await import('../../shared/llm');
      return externalProvider(
        { ...this.connection.route, model: model.split(':').slice(2).join(':') },
        this.connection.key,
      );
    }
    if (!this.native) {
      const { GoogleGenAI } = await import('@google/genai');
      const client = new GoogleGenAI({
        apiKey: this.connection.geminiKey,
        httpOptions: { retryOptions: { attempts: 1 } },
      });
      this.native = {
        generate: (p) => client.models.generateContent(p),
        stream: (p) => client.models.generateContentStream(p),
        inspect: (name, signal) =>
          client.models.get({ model: name, config: { abortSignal: signal } }),
      };
    }
    return this.native;
  }
  private fallback(model: string, error: unknown, nativeOnly: boolean) {
    const status = statusOf(error);
    if (status === 429 && !model.startsWith('external:')) {
      if (cooldowns.size > 20) cooldowns.clear();
      cooldowns.set(this.connection.geminiKey, Date.now() + (dailyLimit(error) ? 900000 : 60000));
    }
    if (
      nativeOnly ||
      !this.connection.route.fallback ||
      ![404, 408, 429, 500, 502, 503, 504].includes(status)
    )
      return undefined;
    if (model.startsWith('external:'))
      return this.plan &&
        !dailyLimit(error) &&
        this.plan.fallback !== model.split(':').slice(2).join(':')
        ? `external:openrouter:${this.plan.fallback}`
        : undefined;
    return this.externalReady
      ? `external:${this.connection.route.provider}:${this.connection.route.model}`
      : undefined;
  }
  private async generate(
    params: Omit<GenerateContentParameters, 'model'>,
    role: Role,
    signal: AbortSignal,
    nativeOnly = false,
    modelOverride?: string,
  ) {
    let model = this.model(
      role,
      role === 'detector' ? 'fast' : role === 'specialist' ? 'deep' : 'balanced',
      nativeOnly,
    );
    if (modelOverride) model = modelOverride;
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      try {
        const response = await (
          await this.provider(model)
        ).generate({
          ...params,
          model,
          config: {
            ...params.config,
            abortSignal: signal,
            maxOutputTokens: appConfig.maxOutputTokens,
          },
        });
        signal.throwIfAborted();
        const finish = response.candidates?.[0]?.finishReason;
        if (finish && finish !== 'STOP')
          throw new RuntimeError(
            'Model output was interrupted or exceeded its output limit. Narrow the request.',
          );
        return { response, model };
      } catch (error) {
        signal.throwIfAborted();
        const next = !attempt && this.fallback(model, error, nativeOnly);
        if (!next) throw error;
        model = next;
      }
    }
  }
  async request(path: string, body: unknown, signal: AbortSignal): Promise<unknown> {
    if (path === 'health') {
      let catalogError: string | undefined;
      if (this.freeOnly && this.connection.key)
        try {
          await this.initialize(signal);
        } catch (e) {
          signal.throwIfAborted();
          catalogError = clientError(e).message;
        }
      const capabilities = resolveCapabilities({
        native: !!this.connection.geminiKey,
        external: this.externalReady,
        primary: this.connection.route.primary,
        fallback: this.connection.route.fallback,
        freeOnly: this.freeOnly,
        catalogReady: !!this.plan,
      });
      return {
        status: catalogError ? 'degraded' : capabilities.text ? 'ready' : 'setup_required',
        hasApiKey: capabilities.text,
        capabilities: { ...capabilities, tts: false },
        catalogError,
        agentPlan: this.plan,
        requiresAccessToken: false,
        localLLMSupported: true,
        pricingConfigured: false,
        requestTimeoutMs: appConfig.timeoutMs,
        models: {
          ...appConfig.models,
          ...(capabilities.text
            ? {
                fast: this.model('detector', 'fast'),
                balanced: this.model('coach'),
                deep: this.model('specialist', 'deep'),
                review: this.model('reviewer'),
              }
            : {}),
        },
      };
    }
    if (path === 'llm-models') {
      const { listExternalModels } = await import('../../shared/llm');
      const models = this.freeOnly
        ? freeTextModels(await catalog(signal)).map((m) => m.id)
        : await listExternalModels(this.connection.route, this.connection.key, signal);
      return { provider: this.connection.route.provider, models, credentialVerified: false };
    }
    await this.initialize(signal);
    if (path === 'diagnostics') {
      const roles: Role[] = ['detector', 'coach', 'specialist', 'reviewer'];
      const models = await Promise.all(
        [...new Set(roles.map((role) => this.model(role)))].map(async (model) => {
          try {
            const selectedProvider = await this.provider(model);
            if (!selectedProvider.inspect) throw new RuntimeError('Model metadata is unavailable.');
            await selectedProvider.inspect(model, signal);
            signal.throwIfAborted();
            return {
              model,
              available: true,
              actions: ['generateContent'],
              message: 'Metadata only; credentials and quota remain unverified.',
            };
          } catch (e) {
            signal.throwIfAborted();
            return { model, available: false, actions: [], message: clientError(e).message };
          }
        }),
      );
      return { checkedAt: new Date().toISOString(), models };
    }
    let params: Omit<GenerateContentParameters, 'model'>;
    let role: Role = 'coach';
    let schema: z.ZodType | undefined;
    let nativeOnly = false;
    if (path === 'detect-question') {
      const data = detectBody.parse(body);
      role = 'detector';
      schema = detectionSchema;
      params = {
        contents: JSON.stringify(data),
        config: {
          systemInstruction: `${safety} Detect substantive questions, ignore incomplete fragments, compare recent questions for duplicates. Return original-language cleanQuestion and confidence 0-100.`,
        },
      };
    } else if (path === 'search-company-intel') {
      const data = searchBody.parse(body);
      nativeOnly = true;
      params = {
        contents: JSON.stringify(data),
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction: `${safety} Research the company in ${data.language}. Include dated sources, products, culture and questions to ask. Separate verified facts from inference.`,
        },
      };
    } else if (path === 'transcribe' || path === 'analyze-doc') {
      const data = binaryBody.parse(body);
      nativeOnly = true;
      role = 'specialist';
      if ((path === 'transcribe') !== data.mimeType.startsWith('audio/'))
        throw new RuntimeError('Unsupported file type for this operation.');
      if (path === 'analyze-doc' && !data.fileType) throw new RuntimeError('Select resume or JD.');
      if (path === 'analyze-doc') schema = z.object({ summary: text(30000) });
      params = {
        contents: [
          { inlineData: { data: data.data, mimeType: data.mimeType } },
          {
            text:
              path === 'transcribe'
                ? `Transcribe only spoken words in ${data.language}; empty for silence; never invent speech.`
                : `Extract factual ${data.fileType} content in ${data.language}. Preserve dates, metrics and requirements. Mark unreadable data.`,
          },
        ],
        config: { systemInstruction: safety },
      };
    } else throw new RuntimeError('This action is unavailable in client mode.');
    if (schema)
      params.config = {
        ...params.config,
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(schema),
      };
    const { response } = await this.generate(
      params,
      role,
      signal,
      nativeOnly,
      path === 'transcribe'
        ? this.connection.route.geminiModel || appConfig.models.transcription
        : undefined,
    );
    if (path === 'search-company-intel')
      return { text: response.text || '', sources: sources(response) };
    if (path === 'transcribe') return { transcript: response.text?.trim() || '' };
    if (path === 'analyze-doc')
      return { analysis: structured(z.object({ summary: text(30000) }), response).summary };
    return structured(schema!, response);
  }
  async stream(body: unknown, signal: AbortSignal, receive: (e: StreamEvent) => void) {
    const data = answerBody.parse(body);
    await this.initialize(signal);
    const role: Role = needsSpecialist(data.taskType, data.question) ? 'specialist' : 'coach';
    let model = this.model(role, data.speed, data.useSearch);
    let markdown = '';
    let received = false;
    let total: Usage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
    let firstTokenMs: number | undefined;
    const found = new Map<string, z.infer<typeof sourceSchema>>();
    const started = Date.now();
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      receive({ type: 'meta', model });
      try {
        const stream = await (
          await this.provider(model)
        ).stream({
          model,
          contents: JSON.stringify({ question: data.question, pastQAs: data.pastQAs }),
          config: {
            abortSignal: signal,
            maxOutputTokens: appConfig.maxOutputTokens,
            systemInstruction: coachPrompt(
              data.context,
              data.language,
              data.isQuickStudy,
              data.tone,
              data.taskType,
            ),
            ...(data.useSearch ? { tools: [{ googleSearch: {} }] } : {}),
          },
        });
        let finish: string | undefined;
        for await (const part of stream) {
          signal.throwIfAborted();
          if (part.text) {
            received = true;
            firstTokenMs ??= Date.now() - started;
            markdown += part.text;
            receive({ type: 'text', text: part.text });
          }
          if (part.usageMetadata) total = usage(part);
          finish = part.candidates?.[0]?.finishReason || finish;
          for (const item of sources(part)) found.set(item.uri, item);
        }
        if (!received || (finish && finish !== 'STOP'))
          throw new RuntimeError(
            'Answer incomplete or output limit reached. Retry with a narrower question.',
          );
        break;
      } catch (e) {
        signal.throwIfAborted();
        const next = !received && !attempt && this.fallback(model, e, data.useSearch);
        if (!next) throw e;
        model = next;
        receive({
          type: 'notice',
          message: 'Switching once to the independent fallback before output.',
        });
      }
    }
    const sections = answerSections(markdown);
    const names = sectionHeaders(markdown).map((h) => h.name);
    if (
      ['DIRECT_ANSWER', 'HOW_IT_WORKS', 'EXECUTIVE_SUMMARY'].some((key) => !sections[key]) ||
      new Set(names).size !== names.length
    )
      throw new RuntimeError(
        'Incomplete answer structure. Retry; this answer has not been marked complete.',
      );
    let review: z.infer<typeof answerReviewSchema> | undefined;
    let reviewModel: string | undefined;
    let reviewUsage: Usage | undefined;
    let reviewStatus: 'complete' | 'unavailable' | 'skipped' = 'skipped';
    if (data.verifyAnswer) {
      receive({ type: 'phase', phase: 'review' });
      try {
        const result = await this.generate(
          {
            contents: JSON.stringify({
              question: data.question,
              context: data.context,
              draft: markdown,
              sources: [...found.values()],
              language: data.language,
            }),
            config: {
              systemInstruction: `${reviewPrompt} Respond in ${data.language}.`,
              responseMimeType: 'application/json',
              responseJsonSchema: z.toJSONSchema(answerReviewSchema),
            },
          },
          'reviewer',
          AbortSignal.any([signal, AbortSignal.timeout(appConfig.reviewTimeoutMs)]),
        );
        review = checkEvidence(structured(answerReviewSchema, result.response), data.context);
        reviewModel = result.model;
        reviewUsage = usage(result.response);
        if (review.revisedDirectAnswer.trim())
          markdown = replaceSection(markdown, 'DIRECT_ANSWER', review.revisedDirectAnswer);
        if (review.revisedExampleScript.trim())
          markdown = replaceSection(markdown, 'EXAMPLE_SCRIPT', review.revisedExampleScript);
        reviewStatus = 'complete';
      } catch {
        signal.throwIfAborted();
        reviewStatus = 'unavailable';
        receive({
          type: 'notice',
          message:
            'Draft preserved; consistency review unavailable. Check the evidence before use.',
        });
      }
    }
    signal.throwIfAborted();
    receive({
      type: 'done',
      model,
      usage: total,
      sources: [...found.values()],
      elapsedMs: Date.now() - started,
      firstTokenMs,
      review,
      reviewModel,
      reviewUsage,
      reviewStatus,
      finalMarkdown: markdown,
    });
  }
}
