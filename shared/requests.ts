import { z } from 'zod';
import { contextSchema, languageSchema, speedSchema, taskTypeSchema } from './contracts.js';
export const text = (max = 5000) => z.string().trim().min(1).max(max);
export const base = {
  context: contextSchema.default(() => contextSchema.parse({})),
  language: languageSchema.default('th'),
};
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
