export type {
  CandidateContext,
  SmartAnswer,
  QueuedQuestion,
  InterviewSession,
  Settings,
  PracticeTurn,
  Usage,
} from '../../shared/contracts';
export type InterviewMode = 'live' | 'manual';
export type AiThinkingSpeed = 'fast' | 'balanced' | 'deep';
export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type QuestionCategory =
  'technical' | 'behavioral' | 'background' | 'situational' | 'salary_culture' | 'other';
export type TechPronunciation = { term: string; thai: string; note?: string };
