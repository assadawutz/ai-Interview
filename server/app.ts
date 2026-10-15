import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { AsyncLocalStorage } from 'node:async_hooks';
import { normalizeGeminiKey } from '../shared/credentials.js';
import { z } from 'zod';
import {
  GoogleGenAI,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Model,
} from '@google/genai';
import {
  contextSchema,
  languageSchema,
  speedSchema,
  detectionSchema,
  answerReviewSchema,
  preparationSchema,
  taskTypeSchema,
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
const text = (max = 5000) => z.string().trim().min(1).max(max);
const base = {
  context: contextSchema.default(() => contextSchema.parse({})),
  language: languageSchema.default('th'),
};
const score = z.number().int().min(0).max(5);
const evaluation = z.object({
  feedback: text(10000),
  scores: z.object({ relevance: score, structure: score, evidence: score, clarity: score }),
  nextQuestion: text(),
  strengths: z.array(z.string().max(2000)).max(5).default([]),
  improvements: z.array(z.string().max(2000)).max(5).default([]),
  suggestedAnswer: z.string().max(8000).default(''),
});
const practiceBody = z.object({
  ...base,
  taskType: taskTypeSchema.default('auto'),
  difficulty: z.enum(['foundation', 'intermediate', 'advanced']).default('intermediate'),
  question: z.string().max(5000).default(''),
  answer: z.string().max(10000).default(''),
  history: z
    .array(z.object({ question: text(), answer: z.string().max(10000) }))
    .max(20)
    .default([]),
});
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
    const value = Number(('status' in error && error.status) || ('code' in error && error.code));
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
  if (status === 429) return new ApiError(429, 'AI quota or rate limit reached. Wait and retry.');
  if (status === 401 || status === 403)
    return new ApiError(
      502,
      'AI credentials or model access are unavailable. Check server configuration.',
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
  } = {},
) {
  // Credentials and clients belong to one request, never a shared process-wide user.
  const requestProvider = new AsyncLocalStorage<{ key: string; provider?: Provider }>();
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
  app.use('/api', (req, res, next) => {
    try {
      const key = normalizeGeminiKey(req.get('X-Gemini-API-Key') || '');
      requestProvider.run({ key }, next);
    } catch {
      return res
        .status(400)
        .json({ error: 'Paste only the Gemini API key value, without spaces or line breaks.' });
    }
  });
  app.get('/api/health', (_req, res) =>
    res.json({
      requestTimeoutMs: config.timeoutMs + 5000,
      status:
        options.provider || requestProvider.getStore()?.key || hasApiKey()
          ? 'ready'
          : 'setup_required',
      hasApiKey: !!options.provider || !!requestProvider.getStore()?.key || hasApiKey(),
      requiresAccessToken: !!(options.accessToken ?? config.accessToken),
      models: config.models,
      pricingConfigured: Object.keys(config.pricing).length > 0,
    }),
  );
  const accessToken = options.accessToken ?? config.accessToken;
  app.use('/api', (req, res, next) => {
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
      limit: config.rateLimit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please wait a minute.' },
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
  function getProvider() {
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
      if (
        !fallback ||
        signal.aborted ||
        params.model === config.models.fallback ||
        ![404, 429, 500, 502, 503, 504].includes(statusOf(error))
      )
        throw error;
      return getProvider().generate({
        ...params,
        model: config.models.fallback,
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
  post(
    '/api/detect-question',
    z.object({
      transcript: text(10000),
      existingQuestions: z.array(z.string().max(5000)).max(50).default([]),
      language: languageSchema.default('th'),
    }),
    async (data, res, signal) => {
      const response = await generate(
        {
          model: config.models.fast,
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
    },
  );

  post(
    '/api/analyze-question-stream',
    z.object({
      ...base,
      question: text(),
      speed: speedSchema.default('balanced'),
      useSearch: z.boolean().default(false),
      isQuickStudy: z.boolean().default(false),
      verifyAnswer: z.boolean().default(true),
      taskType: taskTypeSchema.default('auto'),
      tone: z.enum(['balanced', 'concise', 'confident']).default('balanced'),
      pastQAs: z
        .array(z.object({ question: text(), directAnswer: z.string().max(20000) }))
        .max(5)
        .default([]),
    }),
    async (data, res, signal) => {
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
      let selected = config.models[data.speed];
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
            ['DIRECT_ANSWER', 'HOW_IT_WORKS', 'EXECUTIVE_SUMMARY'].some(
              (name) => !sections[name],
            ) ||
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
              reviewModel = config.models.fast;
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
          if (
            receivedText ||
            signal.aborted ||
            selected === config.models.fallback ||
            ![404, 429, 500, 502, 503, 504].includes(statusOf(error))
          )
            throw error;
          selected = config.models.fallback;
          await send({
            type: 'notice',
            message: 'Primary model unavailable; using the configured fallback.',
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
    },
  );

  post('/api/preparation-plan', z.object(base), async (data, res, signal) => {
    const response = await generate(
      {
        model: config.models.balanced,
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
  post('/api/diagnostics', z.object({}), async (_data, res, signal) => {
    const client = getProvider();
    if (!client.inspect) throw new ApiError(501, 'Model inspection is unavailable.');
    const results = await Promise.all(
      [...new Set(Object.values(config.models))].map(async (model) => {
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

  post(
    '/api/search-company-intel',
    z.object({
      ...base,
      companyName: text(200),
      companyWebsiteUrl: z.string().max(2000).default(''),
      companyLinkedInUrl: z.string().max(2000).default(''),
    }),
    async (data, res, signal) => {
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
    },
  );
  post(
    '/api/copilot-chat',
    z.object({
      ...base,
      activeQuestion: z.string().max(5000).default(''),
      messages: z
        .array(z.object({ role: z.enum(['user', 'assistant']), text: text(10000) }))
        .min(1)
        .max(20),
    }),
    async (data, res, signal) => {
      const response = await generate(
        {
          model: config.models.balanced,
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
    },
  );
  post('/api/practice', practiceBody, async (data, res, signal) => {
    if (data.question && !data.answer.trim())
      throw new ApiError(400, 'Provide your answer before requesting feedback.');
    const schema = data.question ? evaluation : z.object({ nextQuestion: text() });
    const response = await generate(
      {
        model: config.models.balanced,
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
