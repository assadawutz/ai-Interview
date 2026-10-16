import {
  text,
  base,
  practiceBody,
  evaluation,
  answerBody,
  detectBody,
  chatBody,
  searchBody,
} from '../shared/requests.js';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { timingSafeEqual, createHash } from 'node:crypto';
// Bounded, per-instance cooldowns store only credential hashes, never keys.
const quotaCooldowns = new Map<string, number>();
import { once } from 'node:events';
import { AsyncLocalStorage } from 'node:async_hooks';
import { resolveCapabilities } from '../shared/capabilities.js';
import { buildAgentPlan, freeCatalog } from './agents.js';
import { needsSpecialist, type AgentPlan } from '../shared/agents.js';
import { normalizeGeminiKey } from '../shared/credentials.js';
import {
  routingSchema,
  defaultRouting,
  externalModel,
  type LLMRouting,
} from '../shared/routing.js';
import {
  externalProvider,
  textOnly,
  ollamaDeploymentSupported,
  listExternalModels,
} from './llm.js';
import { z } from 'zod';
import {
  GoogleGenAI,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Model,
} from '@google/genai';
import {
  languageSchema,
  detectionSchema,
  answerReviewSchema,
  preparationSchema,
  type AnswerReview,
  type Usage,
  sourceSchema,
} from '../shared/contracts.js';
import { config, hasApiKey, estimateCost } from './config.js';
import { coachPrompt, safety, reviewPrompt, preparationPrompt } from './prompts.js';
import { answerSections, sectionHeaders } from '../shared/markdown.js';
import { audioToWav } from './audio.js';
import { checkEvidence, checkPreparation, replaceSection } from './quality.js';

export interface Provider {
  generate(params: GenerateContentParameters): Promise<GenerateContentResponse>;
  stream(params: GenerateContentParameters): Promise<AsyncGenerator<GenerateContentResponse>>;
  inspect?(model: string, signal: AbortSignal): Promise<Model>;
}
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const binary = (allowed: string[]) =>
  z.object({
    data: z
      .string()
      .min(4)
      .max(12 * 1024 * 1024)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/)
      .refine((v) => v.length % 4 === 0, 'Invalid base64')
      .refine((v) => Buffer.from(v, 'base64').length <= 3 * 1024 * 1024, 'File too large'),
    mimeType: z.enum(allowed as [string, ...string[]]),
  });
const statusOf = (error: unknown) => {
  if (error && typeof error === 'object') {
    const value = Number(
      ('status' in error && error.status) ||
        ('statusCode' in error && error.statusCode) ||
        ('code' in error && error.code),
    );
    return Number.isFinite(value) ? value : 500;
  }
  return 500;
};
function publicError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof z.ZodError)
    return new ApiError(
      400,
      'Invalid request. Check text lengths, file format, and required fields.',
    );
  if (error instanceof Error && /abort|timeout/i.test(error.name + error.message))
    return new ApiError(504, 'AI request timed out or was canceled. Please retry.');
  const status = statusOf(error);
  if (status === 429)
    return new ApiError(
      429,
      'Provider quota or rate limit reached. Check its usage/billing or configure an independent LLM fallback in Settings.',
    );
  if (status === 400)
    return new ApiError(
      400,
      'This model or route does not support the request. External routes support text only; turn off Google Search and use Gemini for documents/audio.',
    );
  if (status === 401 || status === 403)
    return new ApiError(
      502,
      'AI credentials or model access are unavailable. Check the selected provider key and model in Settings.',
    );
  if (status === 404)
    return new ApiError(
      502,
      'Configured AI model is unavailable. Check model settings and account access.',
    );
  return new ApiError(502, 'The AI service could not complete this request. Please retry.');
}
function structured<S extends z.ZodType>(schema: S, text: string | undefined): z.infer<S> {
  try {
    return schema.parse(JSON.parse(text || '{}'));
  } catch {
    throw new ApiError(502, 'The AI returned an invalid structured response. Please retry.');
  }
}
function getSources(response: GenerateContentResponse) {
  return (response.candidates?.[0]?.groundingMetadata?.groundingChunks || []).flatMap((chunk) => {
    const parsed = sourceSchema.safeParse({
      title: chunk.web?.title || chunk.web?.uri,
      uri: chunk.web?.uri,
    });
    return parsed.success ? [parsed.data] : [];
  });
}

export function createApp(
  options: {
    provider?: Provider;
    accessToken?: string;
    providerFactory?: (key: string) => Provider;
    externalFactory?: (route: LLMRouting, key: string) => Provider;
    freeCatalog?: typeof freeCatalog;
  } = {},
) {
  // Credentials and clients belong to one request, never a shared process-wide user.
  const requestProvider = new AsyncLocalStorage<{
    key: string;
    provider?: Provider;
    route: LLMRouting;
    externalKey: string;
    externals?: Map<string, Provider>;
    plan?: AgentPlan;
    catalogError?: string;
    nativeLimited?: boolean;
  }>();
  const app = express();
  app.disable('x-powered-by');
  // Vite requires inline styles/scripts in development. Production is self-hosted.
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production'
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'blob:'],
                mediaSrc: ["'self'", 'data:', 'blob:'],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                upgradeInsecureRequests: null,
              },
            }
          : false,
    }),
  );
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const accessToken = options.accessToken ?? config.accessToken;
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' && req.path === '/health') return next();
    if (req.method !== 'GET' && req.headers.origin) {
      const allowed = config.appUrl
        ? new URL(config.appUrl).origin
        : `${req.protocol}://${req.get('host')}`;
      const deploymentOrigin =
        process.env.VERCEL === '1' && process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : undefined;
      if (req.headers.origin !== allowed && req.headers.origin !== deploymentOrigin)
        return res.status(403).json({ error: 'This origin is not allowed.' });
    }
    if (accessToken) {
      const provided = Buffer.from(req.get('authorization')?.replace(/^Bearer /, '') || '');
      const expected = Buffer.from(accessToken);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
        return res
          .status(401)
          .json({ error: 'Enter a valid app access token in system settings.' });
    }
    next();
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      skip: (req) => req.method === 'GET' && req.path === '/health',
      limit: config.rateLimit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please wait a minute.' },
    }),
  );
  app.use('/api', async (req, res, next) => {
    try {
      const key = normalizeGeminiKey(req.get('X-Gemini-API-Key') || '');
      const route = routingSchema.parse(JSON.parse(req.get('X-LLM-Config') || '{}'));
      const externalKey = normalizeGeminiKey(req.get('X-LLM-API-Key') || '');
      let plan: AgentPlan | undefined;
      let catalogError: string | undefined;
      if (route.freeOnly || route.agentMode) {
        if (route.provider !== 'openrouter')
          return res.status(400).json({
            error:
              'Verified free agent routing requires OpenRouter. Disable this preset to use another provider.',
          });
        try {
          plan = buildAgentPlan(await (options.freeCatalog || freeCatalog)());
        } catch {
          catalogError =
            'Cannot verify free model prices. Requests are paused; paid models will not be selected.';
          if (!(req.method === 'GET' && req.path === '/health'))
            return res.status(503).json({ error: catalogError });
        }
      }
      requestProvider.run({ key, route, externalKey, plan, catalogError }, next);
    } catch {
      return res.status(400).json({
        error:
          'Invalid AI routing settings or credential. Paste a key value without spaces or line breaks.',
      });
    }
  });
  app.get('/api/health', (_req, res) =>
    res.json({
      requestTimeoutMs: config.timeoutMs + 5000,
      status: requestProvider.getStore()?.catalogError
        ? 'degraded'
        : capabilities().text
          ? 'ready'
          : 'setup_required',
      hasApiKey: capabilities().text,
      capabilities: capabilities(),
      catalogError: requestProvider.getStore()?.catalogError,
      requiresAccessToken: !!(options.accessToken ?? config.accessToken),
      models: getModels(),
      agentPlan: requestProvider.getStore()?.plan,
      pricingConfigured: Object.keys(config.pricing).length > 0,
      localLLMSupported: ollamaDeploymentSupported(),
    }),
  );
  app.use(express.json({ limit: '4mb' }));
  let serverProvider: Provider | undefined;
  function makeProvider(key: string): Provider {
    if (options.providerFactory) return options.providerFactory(key);
    const client = new GoogleGenAI({ apiKey: key });
    return {
      generate: (p) => client.models.generateContent(p),
      stream: (p) => client.models.generateContentStream(p),
      inspect: (model, signal) => client.models.get({ model, config: { abortSignal: signal } }),
    };
  }
  function getNativeProvider() {
    if (options.provider) return options.provider;
    const current = requestProvider.getStore();
    if (current?.key) return (current.provider ??= makeProvider(current.key));
    if (!hasApiKey())
      throw new ApiError(
        503,
        'Add your Gemini API key in Settings, or set GEMINI_API_KEY on the server.',
      );
    return (serverProvider ??= makeProvider(config.apiKey));
  }
  function hasExternal() {
    const state = requestProvider.getStore();
    return !!(
      (state?.externalKey || state?.route.provider === 'ollama') &&
      state?.route.model &&
      (state.route.fallback || state.route.primary === 'external')
    );
  }
  function capabilities() {
    const state = requestProvider.getStore();
    const route = state?.route || defaultRouting;
    return resolveCapabilities({
      native: !!(options.provider || state?.key || hasApiKey()),
      external: hasExternal() && (route.provider !== 'ollama' || ollamaDeploymentSupported()),
      primary: route.primary,
      fallback: route.fallback,
      freeOnly: route.freeOnly || route.agentMode,
      catalogReady: !!state?.plan,
    });
  }
  function quotaIdentity() {
    const key = requestProvider.getStore()?.key || config.apiKey;
    return key ? createHash('sha256').update(key).digest('hex') : undefined;
  }
  function coolingDown() {
    const identity = quotaIdentity();
    if (!identity) return false;
    const until = quotaCooldowns.get(identity) || 0;
    if (until <= Date.now()) {
      quotaCooldowns.delete(identity);
      return false;
    }
    return true;
  }
  function getModels() {
    const state = requestProvider.getStore();
    const route = state?.route || defaultRouting;
    const models = route.geminiModel
      ? {
          ...config.models,
          fast: route.geminiModel,
          balanced: route.geminiModel,
          deep: route.geminiModel,
        }
      : { ...config.models };
    const result = { ...models, review: models.fast };
    if (hasExternal()) {
      models.fallback = externalModel(route);
      if (
        route.primary === 'external' ||
        state?.nativeLimited ||
        coolingDown() ||
        !(options.provider || state?.key || hasApiKey())
      )
        models.fast = models.balanced = models.deep = externalModel(route);
    }
    if (state?.plan && hasExternal()) {
      const encode = (id: string) => `external:openrouter:${id}`;
      result.fast = encode(state.plan.detector);
      result.balanced = encode(state.plan.coach);
      result.deep = encode(state.plan.specialist);
      result.review = encode(state.plan.reviewer);
      result.fallback = encode(state.plan.fallback);
      return result;
    }
    return { ...models, review: models.fast };
  }
  function getProvider(): Provider {
    if (!hasExternal()) {
      if (
        requestProvider.getStore()?.route.primary === 'external' &&
        !(requestProvider.getStore()?.route.freeOnly || requestProvider.getStore()?.route.agentMode)
      )
        throw new ApiError(503, 'Add the selected provider key and model in Settings.');
      if (requestProvider.getStore()?.route.freeOnly || requestProvider.getStore()?.route.agentMode)
        throw new ApiError(
          503,
          'Add an OpenRouter key for the free agent preset. Paid or Gemini routes are blocked.',
        );
      return getNativeProvider();
    }
    const state = requestProvider.getStore()!;
    const select = (model: string) => {
      if (!model.startsWith('external:')) {
        if (state.route.freeOnly || state.route.agentMode)
          throw new ApiError(
            400,
            'Free-only agents support text. Use browser speech; Google audio, documents and search are disabled.',
          );
        return getNativeProvider();
      }
      if (state.route.provider === 'ollama' && !ollamaDeploymentSupported())
        throw new ApiError(
          409,
          'Vercel cannot reach Ollama on your computer. Run this app locally with Ollama, or configure a trusted OLLAMA_BASE_URL on the server.',
        );
      const prefix = `external:${state.route.provider}:`;
      if (!model.startsWith(prefix)) throw new ApiError(400, 'Invalid provider route.');
      const id = model.slice(prefix.length);
      if (state.plan && !Object.values(state.plan).includes(id))
        throw new ApiError(403, 'Model is outside the verified free agent plan.');
      state.externals ??= new Map();
      if (!state.externals.has(model))
        state.externals.set(
          model,
          (options.externalFactory || externalProvider)(
            { ...state.route, model: id },
            state.externalKey,
          ),
        );
      return state.externals.get(model)!;
    };
    return {
      generate: (params) => select(params.model).generate(params),
      stream: (params) => select(params.model).stream(params),
      inspect: (model, signal) => {
        const provider = select(model);
        if (!provider.inspect) throw new ApiError(501, 'Model inspection is unavailable.');
        return provider.inspect(model, signal);
      },
    };
  }
  // Bounded routing controller: a single failover, with no restart after partial output.
  function fallbackModel(model: string, error: unknown, params: GenerateContentParameters) {
    if (![404, 429, 500, 502, 503, 504].includes(statusOf(error))) return undefined;
    const state = requestProvider.getStore();
    if (model.startsWith('external:')) {
      if (!state?.plan || !state.route.fallback || !textOnly(params)) return undefined;
      if (
        statusOf(error) === 429 &&
        error instanceof Error &&
        /daily|per[-_ ]?day|credits|billing/i.test(error.message)
      )
        return undefined;
      const backup = `external:openrouter:${state.plan.fallback}`;
      return backup !== model ? backup : undefined;
    }
    if (hasExternal() && state?.route.fallback && textOnly(params)) {
      if (statusOf(error) === 429) {
        state.nativeLimited = true;
        const identity = quotaIdentity();
        if (identity) {
          if (quotaCooldowns.size >= 512)
            quotaCooldowns.delete(quotaCooldowns.keys().next().value!);
          const daily = error instanceof Error && /perday|per_day|daily/i.test(error.message);
          quotaCooldowns.set(identity, Date.now() + (daily ? 15 * 60000 : 60000));
        }
      }
      return externalModel(state.route);
    }
    if (statusOf(error) === 429) return undefined;
    return model !== getModels().fallback && !getModels().fallback.startsWith('external:')
      ? getModels().fallback
      : undefined;
  }
  function requestSignal(res: Response) {
    const controller = new AbortController();
    const close = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once('close', close);
    return {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(config.timeoutMs)]),
      cleanup: () => res.off('close', close),
    };
  }
  async function generate(params: GenerateContentParameters, signal: AbortSignal, fallback = true) {
    try {
      return await getProvider().generate({
        ...params,
        config: { maxOutputTokens: config.maxOutputTokens, ...params.config, abortSignal: signal },
      });
    } catch (error) {
      const next =
        fallback && !signal.aborted ? fallbackModel(params.model, error, params) : undefined;
      if (!next) throw error;
      return getProvider().generate({
        ...params,
        model: next,
        config: { maxOutputTokens: config.maxOutputTokens, ...params.config, abortSignal: signal },
      });
    }
  }
  function post<S extends z.ZodType>(
    path: string,
    schema: S,
    handler: (data: z.infer<S>, res: Response, signal: AbortSignal) => Promise<void>,
  ) {
    app.post(path, async (req, res) => {
      const lifecycle = requestSignal(res);
      try {
        await handler(schema.parse(req.body), res, lifecycle.signal);
      } catch (error) {
        const safe = publicError(error);
        console.error(`[API ${req.path}] ${safe.status}`);
        if (!res.headersSent && !res.destroyed)
          res.status(safe.status).json({ error: safe.message });
      } finally {
        lifecycle.cleanup();
      }
    });
  }
  post('/api/detect-question', detectBody, async (data, res, signal) => {
    const response = await generate(
      {
        model: getModels().fast,
        contents: JSON.stringify(data),
        config: {
          systemInstruction: `${safety} Detect substantive interview questions in the transcript. Ignore candidate answers, filler and incomplete fragments. Extract the question in the original language without adding phonetics. Check recent questions for semantic duplicates. Confidence is only question-detection confidence, 0-100.`,
          responseMimeType: 'application/json',
          responseJsonSchema: z.toJSONSchema(detectionSchema),
        },
      },
      signal,
    );
    res.json(structured(detectionSchema, response.text));
  });

  post('/api/analyze-question-stream', answerBody, async (data, res, signal) => {
    getProvider();
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const send = async (event: object) => {
      if (res.destroyed || signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!res.write(`data: ${JSON.stringify(event)}\n\n`)) await once(res, 'drain', { signal });
    };
    const heartbeat = setInterval(() => {
      if (!res.destroyed && !res.writableEnded) res.write(': heartbeat\n\n');
    }, 15000);
    const started = Date.now();
    let receivedText = false;
    const specialized =
      requestProvider.getStore()?.plan && needsSpecialist(data.taskType, data.question);
    let selected = data.useSearch
      ? config.models[data.speed]
      : specialized
        ? getModels().deep
        : getModels()[data.speed];
    try {
      const run = async (model: string) => {
        await send({ type: 'meta', model });
        const stream = await getProvider().stream({
          model,
          contents: JSON.stringify({ question: data.question, recentAnswers: data.pastQAs }),
          config: {
            systemInstruction: coachPrompt(
              data.context,
              data.language,
              data.isQuickStudy,
              data.tone,
              data.taskType,
            ),
            maxOutputTokens: config.maxOutputTokens,
            tools: data.useSearch ? [{ googleSearch: {} }] : undefined,
            abortSignal: signal,
          },
        });
        let usage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
        let markdown = '',
          firstTokenMs: number | undefined;
        let finishReason: string | undefined;
        const sources = new Map<string, { title: string; uri: string }>();
        for await (const chunk of stream) {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (chunk.text) {
            receivedText = true;
            firstTokenMs ??= Date.now() - started;
            markdown += chunk.text;
            await send({ type: 'text', text: chunk.text });
          }
          finishReason = chunk.candidates?.[0]?.finishReason || finishReason;
          for (const source of getSources(chunk)) sources.set(source.uri, source);
          if (chunk.usageMetadata)
            usage = {
              inputTokens: chunk.usageMetadata.promptTokenCount || 0,
              outputTokens: chunk.usageMetadata.candidatesTokenCount || 0,
              thinkingTokens: chunk.usageMetadata.thoughtsTokenCount || 0,
            };
        }
        if (!receivedText)
          throw new ApiError(502, 'No answer was returned. Try rephrasing the question.');
        const sections = answerSections(markdown);
        const names = sectionHeaders(markdown).map((header) => header.name);
        if (
          ['DIRECT_ANSWER', 'HOW_IT_WORKS', 'EXECUTIVE_SUMMARY'].some((name) => !sections[name]) ||
          new Set(names).size !== names.length
        )
          throw new ApiError(
            502,
            'The AI returned an incomplete or ambiguous answer structure. Please retry.',
          );
        if (finishReason && finishReason !== 'STOP')
          throw new ApiError(
            502,
            'The answer was interrupted or reached its output limit. Try Quick study or a narrower question.',
          );
        let review: AnswerReview | undefined,
          reviewModel: string | undefined,
          reviewUsage: Usage | undefined;
        let reviewStatus = data.verifyAnswer ? 'pending' : 'skipped';
        let finalMarkdown: string | undefined;
        if (data.verifyAnswer) {
          await send({ type: 'phase', phase: 'review' });
          try {
            reviewModel = getModels().review;
            const reviewSignal = AbortSignal.any([signal, AbortSignal.timeout(20000)]);
            const response = await generate(
              {
                model: reviewModel,
                contents: JSON.stringify({
                  question: data.question,
                  context: data.context,
                  draft: markdown,
                  sources: [...sources.values()],
                  language: data.language,
                }),
                config: {
                  systemInstruction: `${reviewPrompt} Respond in ${data.language === 'th' ? 'Thai' : 'English'}.`,
                  responseMimeType: 'application/json',
                  responseJsonSchema: z.toJSONSchema(answerReviewSchema),
                },
              },
              reviewSignal,
              false,
            );
            review = checkEvidence(structured(answerReviewSchema, response.text), data.context);
            reviewUsage = {
              inputTokens: response.usageMetadata?.promptTokenCount || 0,
              outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
              thinkingTokens: response.usageMetadata?.thoughtsTokenCount || 0,
            };
            if (review.revisedDirectAnswer.trim())
              markdown = replaceSection(markdown, 'DIRECT_ANSWER', review.revisedDirectAnswer);
            if (review.revisedExampleScript.trim())
              markdown = replaceSection(markdown, 'EXAMPLE_SCRIPT', review.revisedExampleScript);
            finalMarkdown = markdown;
            reviewStatus = 'complete';
          } catch (error) {
            if (signal.aborted) throw error;
            reviewStatus = 'unavailable';
            await send({
              type: 'notice',
              message:
                'The draft is available, but the AI consistency review could not finish. Check assumptions and evidence before using it.',
            });
          }
        }
        await send({
          type: 'done',
          model,
          usage,
          sources: [...sources.values()],
          firstTokenMs,
          elapsedMs: Date.now() - started,
          estimatedCostUsd: estimateCost(model, usage),
          review,
          reviewStatus,
          reviewModel,
          reviewUsage,
          reviewCostUsd:
            reviewModel && reviewUsage ? estimateCost(reviewModel, reviewUsage) : undefined,
          finalMarkdown,
        });
      };
      try {
        await run(selected);
      } catch (error) {
        const next =
          !receivedText && !signal.aborted
            ? fallbackModel(selected, error, {
                model: selected,
                contents: data.question,
                config: { tools: data.useSearch ? [{ googleSearch: {} }] : undefined },
              })
            : undefined;
        if (!next) throw error;
        selected = next;
        await send({
          type: 'notice',
          message: `Primary model unavailable; routing to ${selected}.`,
        });
        await run(selected);
      }
    } catch (error) {
      if (!res.destroyed)
        res.write(
          `data: ${JSON.stringify({ type: 'error', error: publicError(error).message })}\n\n`,
        );
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  });

  post('/api/preparation-plan', z.object(base), async (data, res, signal) => {
    const response = await generate(
      {
        model: getModels().balanced,
        contents: JSON.stringify(data),
        config: {
          systemInstruction: `${preparationPrompt} Respond in ${data.language === 'th' ? 'Thai' : 'English'}.`,
          responseMimeType: 'application/json',
          responseJsonSchema: z.toJSONSchema(preparationSchema),
        },
      },
      signal,
    );
    res.json({
      plan: checkPreparation(structured(preparationSchema, response.text), data.context),
      modelUsed: response.modelVersion || 'provider model (version not reported)',
    });
  });
  post('/api/llm-models', z.object({}), async (_data, res, signal) => {
    const state = requestProvider.getStore()!;
    if (state.route.provider === 'ollama' && !ollamaDeploymentSupported())
      throw new ApiError(
        409,
        'Use Ollama Cloud on Vercel; local Ollama requires a reachable server.',
      );
    const models = state.route.freeOnly
      ? (await (options.freeCatalog || freeCatalog)())
          .filter(
            (m) =>
              (m.id.endsWith(':free') || m.id === 'openrouter/free') &&
              Number(m.pricing?.prompt ?? -1) === 0 &&
              Number(m.pricing?.completion ?? -1) === 0,
          )
          .map((m) => m.id)
      : await listExternalModels(state.route, state.externalKey, signal);
    res.json({ provider: state.route.provider, models, credentialVerified: false });
  });
  post('/api/diagnostics', z.object({}), async (_data, res, signal) => {
    const client = getProvider();
    if (!client.inspect) throw new ApiError(501, 'Model inspection is unavailable.');
    const results = await Promise.all(
      [...new Set(Object.values(getModels()))].map(async (model) => {
        try {
          const metadata = await client.inspect!(model, signal);
          return {
            model,
            available: true,
            actions: metadata.supportedActions || [],
            message: 'Model metadata accessible. Generation and quota are not verified.',
          };
        } catch (error) {
          return { model, available: false, actions: [], message: publicError(error).message };
        }
      }),
    );
    res.json({ checkedAt: new Date().toISOString(), models: results });
  });

  post('/api/search-company-intel', searchBody, async (data, res, signal) => {
    const response = await generate(
      {
        model: config.models.balanced,
        contents: JSON.stringify(data),
        config: {
          systemInstruction: `${safety} Research this company using web search. Respond in ${data.language === 'en' ? 'English' : 'Thai'}. Summarize products, recent dated news, hiring priorities and 3 useful questions to ask. Distinguish verified facts from inference. Do not imply access to private LinkedIn data.`,
          tools: [{ googleSearch: {} }],
        },
      },
      signal,
    );
    res.json({ text: response.text || '', sources: getSources(response) });
  });
  post('/api/copilot-chat', chatBody, async (data, res, signal) => {
    const response = await generate(
      {
        model: getModels().balanced,
        contents: data.messages.map((m) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        })),
        config: {
          systemInstruction: `${safety} Answer interview follow-ups concisely in ${data.language === 'en' ? 'English' : 'Thai'}. Context data: ${JSON.stringify(data.context)}. Current question: ${JSON.stringify(data.activeQuestion)}`,
        },
      },
      signal,
    );
    res.json({ reply: response.text || '' });
  });
  post('/api/practice', practiceBody, async (data, res, signal) => {
    if (data.question && !data.answer.trim())
      throw new ApiError(400, 'Provide your answer before requesting feedback.');
    const schema = data.question ? evaluation : z.object({ nextQuestion: text() });
    const response = await generate(
      {
        model: getModels().balanced,
        contents: JSON.stringify(data),
        config: {
          systemInstruction: `${safety} You are conducting a mock interview in ${data.language === 'en' ? 'English' : 'Thai'}. ${data.question ? 'Evaluate only the submitted answer against the actual question and role with integer scores 0-5. Relevance: all parts answered; structure: clear logical order; evidence: correct technical reasoning or real concrete examples; clarity: understandable precise language. Identify technical errors without rewarding confident misinformation. Score 0 for absent content, 1 for major errors, 2 for incomplete, 3 for adequate, 4 for strong, 5 for accurate and complete. Give actionable feedback, strengths, improvements and a suggestedAnswer using only supplied personal facts or explicit placeholders. For coding, include edge cases and complexity, never claim execution. Ask one contextual follow-up. Scores are coaching feedback, not hiring probability.' : 'Ask one relevant opening question for this role, requested taskType and difficulty. Avoid repeating history.'}`,
          responseMimeType: 'application/json',
          responseJsonSchema: z.toJSONSchema(schema),
        },
      },
      signal,
    );
    res.json(structured(schema, response.text));
  });
  post(
    '/api/transcribe',
    binary(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg']).extend({
      language: languageSchema.default('th'),
    }),
    async (data, res, signal) => {
      const response = await generate(
        {
          model: config.models.transcription,
          contents: [
            { inlineData: { mimeType: data.mimeType, data: data.data } },
            {
              text: `Transcribe speech accurately in ${data.language === 'en' ? 'English' : 'Thai and English'}. Return only spoken words, or an empty string for silence. Do not invent speech.`,
            },
          ],
        },
        signal,
        false,
      );
      res.json({ transcript: response.text?.trim() || '' });
    },
  );
  post(
    '/api/tts',
    z.object({ text: text(5000), language: languageSchema.default('th') }),
    async (data, res, signal) => {
      const response = await generate(
        {
          model: config.models.tts,
          contents: [{ text: data.text }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          },
        },
        signal,
        false,
      );
      const audio = response.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData?.data,
      )?.inlineData;
      if (!audio?.data || !audio.mimeType) throw new ApiError(502, 'No speech audio was returned.');
      res.json(audioToWav(audio.data, audio.mimeType));
    },
  );
  post(
    '/api/analyze-doc',
    binary(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']).extend({
      fileType: z.enum(['resume', 'jd']),
      language: languageSchema.default('th'),
    }),
    async (data, res, signal) => {
      const schema = z.object({ summary: text(30000) });
      const response = await generate(
        {
          model: config.models.deep,
          contents: [
            { inlineData: { mimeType: data.mimeType, data: data.data } },
            {
              text: `Extract factual ${data.fileType} content, skills and requirements in ${data.language === 'en' ? 'English' : 'Thai'}. Preserve original employers, dates, metrics and distinctions between requirements and achievements. Mark unreadable or missing data. Do not invent any facts.`,
            },
          ],
          config: {
            systemInstruction: safety,
            responseMimeType: 'application/json',
            responseJsonSchema: z.toJSONSchema(schema),
          },
        },
        signal,
      );
      res.json({ analysis: structured(schema, response.text).summary });
    },
  );
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = statusOf(error);
    res.status(status === 413 ? 413 : status === 400 ? 400 : 500).json({
      error:
        status === 413
          ? 'File too large. Maximum file size is 3 MB.'
          : status === 400
            ? 'Malformed JSON request.'
            : 'Unexpected server error. Please retry.',
    });
  });
  return app;
}
