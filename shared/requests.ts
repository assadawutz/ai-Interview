import { z } from 'zod';
import { contextSchema, languageSchema, speedSchema, taskTypeSchema } from './contracts.js';
export const text = (max = 5000) => z.string().trim().min(1).max(max);
export const base = {
  context: contextSchema.default(() => contextSchema.parse({})),
  language: languageSchema.default('th'),
};
const score = z.number().int().min(0).max(5);
export const evaluation = z.object({
  feedback: text(10000),
  scores: z.object({ relevance: score, structure: score, evidence: score, clarity: score }),
  nextQuestion: text(),
  strengths: z.array(z.string().max(2000)).max(5).default([]),
  improvements: z.array(z.string().max(2000)).max(5).default([]),
  suggestedAnswer: z.string().max(8000).default(''),
});
export const practiceBody = z.object({
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
export const answerBody = z.object({
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
});
export const detectBody = z.object({
  transcript: text(10000),
  existingQuestions: z.array(z.string().max(5000)).max(50).default([]),
  language: languageSchema.default('th'),
});
export const chatBody = z.object({
  ...base,
  activeQuestion: z.string().max(5000).default(''),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: text(10000) }))
    .min(1)
    .max(20),
});
export const searchBody = z.object({
  ...base,
  companyName: text(200),
  companyWebsiteUrl: z.string().max(2000).default(''),
  companyLinkedInUrl: z.string().max(2000).default(''),
});
export const binaryBody = z.object({
  data: z
    .string()
    .min(4)
    .max(4 * 1024 * 1024)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/)
    .refine((v) => v.length % 4 === 0, 'Invalid base64'),
  mimeType: z.enum([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/wav',
    'audio/mpeg',
  ]),
  language: languageSchema.default('th'),
  fileType: z.enum(['resume', 'jd']).optional(),
});
