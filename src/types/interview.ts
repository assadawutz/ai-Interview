export type InterviewMode = 'live' | 'manual';

export type AiThinkingSpeed = 'fast' | 'balanced' | 'deep';

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CandidateContext {
  role: string;
  targetCompany: string;
  companyWebsiteUrl?: string;
  companyLinkedInUrl?: string;
  resume: string;
  jd: string;
  jdFileName?: string;
  coverLetter: string;
  experienceYears?: string;
  keySkills?: string;
}

export interface TechPronunciation {
  term: string;
  thai: string; // Format e.g., 'อะ-ไจล (Agile)'
  note?: string;
}

export interface SmartAnswer {
  id: string;
  questionId?: string;
  question: string;
  timestamp: number;
  riskLevel: RiskLevel;
  riskSummary: string;
  // Core 4 Pillars + Real Example
  directAnswer: string;      // คำตอบที่ถูกต้อง สั้นตรงจุด
  exampleScript: string;     // การยกตัวอย่างคำพูดจริง (Verbatim Spoken Script)
  howItWorks: string;        // รูปแบบการทำงานและกรอบความคิด (Mental Model / Evaluation Framework)
  commonPitfalls: string;    // ปัญหาที่พบบ่อยและข้อผิดพลาด (Common Pitfalls & Red Flags)
  solutions: string;         // ทางแก้ไข วิธีเอาตัวรอด และทางออก (Solutions & Strategic Options)
  pronunciations: TechPronunciation[]; // คำอ่านศัพท์เทคนิค
  // Full-polish lock state
  isLocked: boolean;         // Locked result indicator
  confidence?: number;       // Detection confidence 0-100
  category?: string;
  rawMarkdown: string;
  isStreaming: boolean;
  modelUsed: string;
  webSources?: Array<{ title?: string; uri?: string }>;
  audioBase64?: string;
  executiveSummary?: string;
  notes?: string;
  vocabulary?: Array<{ word: string; phonetics?: string; meaning: string; contextExample: string }>;
  isQuickFire?: boolean;
}

export type QuestionCategory = 'technical' | 'behavioral' | 'strategy' | 'cultural' | 'salary' | 'other';

export interface QueuedQuestion {
  id: string;
  text: string;
  detectedAt: number;
  status: 'active' | 'queued' | 'answered' | 'dismissed';
  category?: QuestionCategory;
  confidence?: number; // 0 - 100
  intent?: string;
  isLocked?: boolean;
}

export interface InterviewSession {
  id: string;
  title: string;
  createdAt: number;
  lastUpdated: number;
  autoExpireHours: number;
  context: CandidateContext;
  questions: QueuedQuestion[];
  answers: SmartAnswer[];
}
