import { z } from 'zod';

export const languageSchema = z.enum(['th', 'en']);
export const speedSchema = z.enum(['fast', 'balanced', 'deep']);
export const categorySchema = z.enum([
  'technical',
  'behavioral',
  'background',
  'situational',
  'salary_culture',
  'other',
]);
export const storySchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  situation: z.string().max(3000),
  task: z.string().max(3000),
  action: z.string().max(5000),
  result: z.string().max(3000),
  skills: z.string().max(1000),
});
export type ExperienceStory = z.infer<typeof storySchema>;
export const taskTypeSchema = z.enum([
  'auto',
  'technical',
  'coding',
  'system_design',
  'behavioral',
  'case',
]);
export const contextSchema = z.object({
  role: z.string().max(200).default(''),
  targetCompany: z.string().max(200).default(''),
  companyWebsiteUrl: z.union([z.url({ protocol: /^https?$/ }), z.literal('')]).default(''),
  companyLinkedInUrl: z.union([z.url({ protocol: /^https?$/ }), z.literal('')]).default(''),
  resume: z.string().max(30000).default(''),
  jd: z.string().max(30000).default(''),
  jdFileName: z.string().max(250).optional(),
  coverLetter: z.string().max(10000).default(''),
  stories: z.array(storySchema).max(20).default([]),
});
export type CandidateContext = z.infer<typeof contextSchema>;
export const sourceSchema = z.object({ title: z.string(), uri: z.url({ protocol: /^https?$/ }) });
export const usageSchema = z.object({
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  thinkingTokens: z.number().nonnegative(),
});
export type Usage = z.infer<typeof usageSchema>;
export const questionSchema = z.object({
  id: z.string().max(100),
  text: z.string().min(1).max(5000),
  detectedAt: z.number(),
  status: z.enum(['queued', 'active', 'answered', 'error', 'canceled', 'dismissed']),
  category: categorySchema.default('other'),
  confidence: z.number().min(0).max(100).optional(),
  origin: z.enum(['manual', 'speech', 'practice']).default('manual'),
  error: z.string().optional(),
});
export type QueuedQuestion = z.infer<typeof questionSchema>;
export const evidenceSchema = z.object({
  source: z.enum(['resume', 'jd', 'coverLetter', 'story']),
  storyId: z.string().max(100).optional(),
  quote: z.string().trim().min(3).max(2000),
  relevance: z.string().min(1).max(2000),
});
export const answerReviewSchema = z.object({
  verdict: z.enum(['consistent', 'needs_revision', 'insufficient_evidence']),
  summary: z.string().min(1).max(3000),
  evidence: z.array(evidenceSchema).max(12),
  concerns: z
    .array(
      z.object({
        severity: z.enum(['info', 'warning', 'critical']),
        claim: z.string().max(2000),
        reason: z.string().max(3000),
      }),
    )
    .max(12),
  missingInformation: z.array(z.string().max(1000)).max(10),
  revisedDirectAnswer: z.string().max(10000).default(''),
  revisedExampleScript: z.string().max(10000).default(''),
});
export type AnswerReview = z.infer<typeof answerReviewSchema>;
export const preparationSchema = z.object({
  summary: z.string().min(1).max(4000),
  requirements: z
    .array(
      z.object({
        requirement: z.string().min(1).max(1500),
        priority: z.enum(['must_have', 'nice_to_have', 'inferred']),
        status: z.enum(['evidence_available', 'partial', 'not_provided']),
        evidence: z.array(evidenceSchema).max(5),
        gap: z.string().max(2000),
        practiceQuestion: z.string().min(1).max(2000),
      }),
    )
    .max(15),
  plan: z
    .array(
      z.object({
        day: z.number().int().min(1).max(7),
        focus: z.string().max(1000),
        actions: z.array(z.string().max(1500)).min(1).max(5),
        successCheck: z.string().max(2000),
      }),
    )
    .min(1)
    .max(7),
  questionsToAsk: z.array(z.string().max(2000)).max(8),
  missingInformation: z.array(z.string().max(1000)).max(10),
});
export type PreparationPlan = z.infer<typeof preparationSchema>;
export const savedPreparationSchema = z.object({
  plan: preparationSchema,
  contextFingerprint: z.string().max(100),
  language: languageSchema,
  createdAt: z.number(),
  modelUsed: z.string().max(200),
});
export type SavedPreparation = z.infer<typeof savedPreparationSchema>;
export const answerSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  question: z.string(),
  timestamp: z.number(),
  riskLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  riskSummary: z.string().default(''),
  directAnswer: z.string().default(''),
  exampleScript: z.string().default(''),
  howItWorks: z.string().default(''),
  commonPitfalls: z.string().default(''),
  solutions: z.string().default(''),
  executiveSummary: z.string().default(''),
  pronunciations: z
    .array(z.object({ term: z.string(), thai: z.string(), note: z.string().optional() }))
    .default([]),
  rawMarkdown: z.string(),
  originalDraft: z.string().optional(),
  isStreaming: z.boolean().default(false),
  isLocked: z.boolean().default(false),
  modelUsed: z.string().default(''),
  webSources: z.array(sourceSchema).default([]),
  confidence: z.number().min(0).max(100).optional(),
  usage: usageSchema.optional(),
  elapsedMs: z.number().nonnegative().optional(),
  estimatedCostUsd: z.number().nonnegative().optional(),
  tone: z.enum(['balanced', 'concise', 'confident']).default('balanced'),
  requestFingerprint: z.string().max(100).optional(),
  language: languageSchema.optional(),
  questionIntent: z.string().default(''),
  assumptions: z.string().default(''),
  clarifyingQuestions: z.string().default(''),
  reasoningSteps: z.string().default(''),
  validationSteps: z.string().default(''),
  followUpQuestions: z.string().default(''),
  solutionCode: z.string().default(''),
  reviewStatus: z.enum(['pending', 'complete', 'unavailable', 'skipped']).default('skipped'),
  review: answerReviewSchema.optional(),
  reviewModel: z.string().optional(),
  reviewUsage: usageSchema.optional(),
  reviewCostUsd: z.number().nonnegative().optional(),
  firstTokenMs: z.number().nonnegative().optional(),
});
export type SmartAnswer = z.infer<typeof answerSchema>;
export const practiceTurnSchema = z.object({
  id: z.string(),
  question: z.string().min(1).max(5000),
  answer: z.string().max(10000),
  feedback: z.string(),
  strengths: z.array(z.string().max(2000)).max(5).default([]),
  improvements: z.array(z.string().max(2000)).max(5).default([]),
  suggestedAnswer: z.string().max(8000).default(''),
  scores: z.object({
    relevance: z.number().min(0).max(5),
    structure: z.number().min(0).max(5),
    evidence: z.number().min(0).max(5),
    clarity: z.number().min(0).max(5),
  }),
});
export type PracticeTurn = z.infer<typeof practiceTurnSchema>;
export const settingsSchema = z.object({
  language: languageSchema.default('th'),
  speed: speedSchema.default('balanced'),
  useSearch: z.boolean().default(false),
  autoSpeak: z.boolean().default(false),
  realtimeMode: z.boolean().default(false),
  quickStudy: z.boolean().default(false),
  minConfidence: z.number().min(0).max(100).default(60),
  autoExpireHours: z.number().min(1).max(720).default(24),
  audioSource: z.enum(['microphone', 'tab']).default('microphone'),
  deviceId: z.string().default(''),
  autosave: z.boolean().default(true),
  practiceDifficulty: z.enum(['foundation', 'intermediate', 'advanced']).default('intermediate'),
  verifyAnswers: z.boolean().default(true),
  taskType: taskTypeSchema.default('auto'),
});
export type Settings = z.infer<typeof settingsSchema>;
export const sessionSchema = z.object({
  version: z.union([z.literal(2), z.literal(3)]).transform(() => 3 as const),
  id: z.string().max(100),
  title: z.string().min(1).max(250),
  createdAt: z.number(),
  lastUpdated: z.number(),
  autoExpireHours: z.number().min(1).max(720),
  context: contextSchema,
  questions: z.array(questionSchema).max(500),
  answers: z.array(answerSchema).max(500),
  practice: z.array(practiceTurnSchema).max(100).default([]),
  practiceDraft: z
    .object({ question: z.string().max(5000), answer: z.string().max(10000) })
    .default({ question: '', answer: '' }),
  settings: settingsSchema.optional(),
  preparation: savedPreparationSchema.optional(),
});
export type InterviewSession = z.infer<typeof sessionSchema>;
export const defaultContext = contextSchema.parse({});
export const defaultSettings = settingsSchema.parse({});
export type Health = {
  status: string;
  hasApiKey: boolean;
  requiresAccessToken: boolean;
  models: Record<string, string>;
  pricingConfigured: boolean;
  requestTimeoutMs?: number;
  localLLMSupported?: boolean;
  agentPlan?: Record<string, string>;
};

export const detectionSchema = z.object({
  isQuestion: z.boolean(),
  cleanQuestion: z.string().max(5000),
  confidence: z.number().min(0).max(100),
  category: categorySchema,
  isDuplicate: z.boolean(),
});
export const diagnosticsSchema = z.object({
  checkedAt: z.string(),
  models: z.array(
    z.object({
      model: z.string(),
      available: z.boolean(),
      actions: z.array(z.string()),
      message: z.string(),
    }),
  ),
});
