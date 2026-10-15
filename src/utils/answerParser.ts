import { RiskLevel, SmartAnswer, TechPronunciation } from '../types/interview';

/**
 * Parses raw streamed markdown text from Gemini into structured SmartAnswer cards
 * with full polish, the 4 core pillars, verbatim script example, and lock state.
 */
export function parseStreamedAnswer(
  rawText: string,
  baseAnswer: Partial<SmartAnswer>
): SmartAnswer {
  let riskLevel: RiskLevel = 'MEDIUM';
  let riskSummary = '';
  let directAnswer = '';
  let exampleScript = '';
  let howItWorks = '';
  let commonPitfalls = '';
  let solutions = '';
  let executiveSummary = '';
  const pronunciations: TechPronunciation[] = [];

  // 1. Parse Risk Level
  const riskLevelMatch = rawText.match(/#\s*\[RISK_LEVEL\]([\s\S]*?)(?=#\s*\[|$)/i);
  if (riskLevelMatch) {
    const rawLevel = riskLevelMatch[1].trim().toUpperCase();
    if (rawLevel.includes('HIGH')) {
      riskLevel = 'HIGH';
    } else if (rawLevel.includes('LOW')) {
      riskLevel = 'LOW';
    } else {
      riskLevel = 'MEDIUM';
    }
  }

  // 2. Parse Risk Summary
  const riskSummaryMatch = rawText.match(/#\s*\[RISK_SUMMARY\]([\s\S]*?)(?=#\s*\[|$)/i);
  if (riskSummaryMatch) {
    riskSummary = riskSummaryMatch[1].trim().replace(/^[-*•]\s*/, '');
  }

  // 3. Parse Direct Answer (คำตอบที่ถูกต้อง)
  const directMatch = rawText.match(/#\s*\[DIRECT_ANSWER\]([\s\S]*?)(?=#\s*\[|$)/i);
  if (directMatch) {
    directAnswer = directMatch[1].trim();
  }

  // 4. Parse Example Script (การยกตัวอย่างคำพูดจริง)
  const exampleMatch = rawText.match(/#\s*\[EXAMPLE_SCRIPT\]([\s\S]*?)(?=#\s*\[|$)/i);
  if (exampleMatch) {
    exampleScript = exampleMatch[1].trim();
  }

  // 5. Parse How It Works & Mental Model (รูปแบบการทำงานและกรอบความคิด)
  const howMatch = rawText.match(/#\s*\[HOW_IT_WORKS\]([\s\S]*?)(?=#\s*\[|$)/i);
  if (howMatch) {
    howItWorks = howMatch[1].trim();
  } else {
    // Fallback if model used older tag [EXPLANATION]
    const legacyExpMatch = rawText.match(/#\s*\[EXPLANATION\]([\s\S]*?)(?=#\s*\[|$)/i);
    if (legacyExpMatch) {
      howItWorks = legacyExpMatch[1].trim();
    }
  }

  // 6. Parse Common Pitfalls (ปัญหาที่พบบ่อยและข้อผิดพลาด)
  const pitfallsMatch = rawText.match(/#\s*\[COMMON_PITFALLS\]([\s\S]*?)(?=#\s*\[|$)/i);
  if (pitfallsMatch) {
    commonPitfalls = pitfallsMatch[1].trim();
  } else {
    // Fallback if model used [RISKS]
    const legacyRisksMatch = rawText.match(/#\s*\[RISKS\]([\s\S]*?)(?=#\s*\[|$)/i);
    if (legacyRisksMatch) {
      commonPitfalls = legacyRisksMatch[1].trim();
    }
  }
  if (!riskSummary && commonPitfalls) {
    const firstLine = commonPitfalls.split('\n')[0].replace(/^[-*•\d.]\s*/, '').trim();
    riskSummary = firstLine.slice(0, 140);
  }

  // 7. Parse Solutions & Recovery (ทางแก้ไขและทางออก)
  const solutionsMatch = rawText.match(/#\s*\[SOLUTIONS\]([\s\S]*?)(?=#\s*\[|$)/i);
  if (solutionsMatch) {
    solutions = solutionsMatch[1].trim();
  } else {
    // Fallback if model used [OPTIONS]
    const legacyOptionsMatch = rawText.match(/#\s*\[OPTIONS\]([\s\S]*?)(?=#\s*\[|$)/i);
    if (legacyOptionsMatch) {
      solutions = legacyOptionsMatch[1].trim();
    }
  }

  // 8. Parse Phonetic Pronunciation Guide
  const pronMatch = rawText.match(/#\s*\[PRONUNCIATION\]([\s\S]*?)(?=#\s*\[|$)/i);
  if (pronMatch) {
    const lines = pronMatch[1].split('\n');
    for (const line of lines) {
      const trimmed = line.trim().replace(/^[-*•]\s*/, '');
      if (!trimmed) continue;

      // Format: "คำอ่านไทย (Original Term) : คำอธิบาย"
      const bracketMatch = trimmed.match(/^([ก-๙\-]+)\s*\(([a-zA-Z0-9\s._\-+]+)\)(?:\s*[:\-–—]\s*(.*))?$/);
      if (bracketMatch) {
        const thaiPhonetic = bracketMatch[1].trim();
        const term = bracketMatch[2].trim();
        const note = bracketMatch[3]?.trim();
        pronunciations.push({
          term,
          thai: `${thaiPhonetic} (${term})`,
          note,
        });
        continue;
      }

      // Format: "Term: คำอ่านไทย [note]"
      const parts = trimmed.split(/[:\-–—]\s*/);
      if (parts.length >= 2) {
        const term = parts[0].trim();
        const rest = parts.slice(1).join(' - ').trim();
        const noteMatch = rest.match(/\[(.*?)\]|\((.*?)\)/);
        let note: string | undefined = undefined;
        let thaiOnly = rest;

        if (noteMatch) {
          note = (noteMatch[1] || noteMatch[2]).trim();
          thaiOnly = rest.replace(/\[(.*?)\]|\((.*?)\)/, '').trim();
        }

        const formattedThai = thaiOnly.includes(`(${term})`)
          ? thaiOnly
          : `${thaiOnly} (${term})`;

        pronunciations.push({
          term,
          thai: formattedThai,
          note,
        });
      } else {
        pronunciations.push({
          term: trimmed,
          thai: trimmed,
        });
      }
    }
  }

  // 9. Parse Executive Summary
  const execMatch = rawText.match(/#\s*\[EXECUTIVE_SUMMARY\]([\s\S]*?)(?=#\s*\[|$)/i);
  if (execMatch) {
    executiveSummary = execMatch[1].trim();
  }

  // Fallback if model hasn't emitted headers yet
  if (!directAnswer && !howItWorks && rawText.trim()) {
    directAnswer = rawText.trim();
  }

  return {
    id: baseAnswer.id || `ans_${Date.now()}`,
    questionId: baseAnswer.questionId,
    question: baseAnswer.question || '',
    timestamp: baseAnswer.timestamp || Date.now(),
    riskLevel: baseAnswer.riskLevel || riskLevel,
    riskSummary: baseAnswer.riskSummary || riskSummary || 'ระวังตอบไม่ตรงจุดหรือขาดตัวอย่างรูปธรรมที่วัดผลได้',
    directAnswer: injectPhoneticsToText(directAnswer, pronunciations),
    exampleScript: injectPhoneticsToText(exampleScript, pronunciations),
    howItWorks: injectPhoneticsToText(howItWorks, pronunciations),
    commonPitfalls: injectPhoneticsToText(commonPitfalls, pronunciations),
    solutions: injectPhoneticsToText(solutions, pronunciations),
    pronunciations,
    rawMarkdown: rawText,
    isStreaming: baseAnswer.isStreaming ?? false,
    isLocked: baseAnswer.isLocked ?? !baseAnswer.isStreaming,
    confidence: baseAnswer.confidence ?? 95,
    category: baseAnswer.category,
    modelUsed: baseAnswer.modelUsed || 'gemini-3.8-flash',
    webSources: baseAnswer.webSources || [],
    audioBase64: baseAnswer.audioBase64,
    executiveSummary: baseAnswer.executiveSummary || executiveSummary,
  };
}

/**
 * Automatically injects Thai phonetic readings into text if missing
 */
export function injectPhoneticsToText(text: string, pronunciations: TechPronunciation[] = []): string {
  if (!text) return '';
  let processed = text;
  
  const map = new Map<string, string>();
  for (const p of pronunciations) {
    if (p.term && p.thai) {
      map.set(p.term.toLowerCase(), p.thai);
    }
  }

  const commonMap: Record<string, string> = {
    'kubernetes': 'คูเบอร์เนติส (Kubernetes)',
    'agile': 'อะไจล (Agile)',
    'typescript': 'ไทป์สคริปต์ (TypeScript)',
    'react': 'รีแอคต์ (React)',
    'node.js': 'โนดเจเอส (Node.js)',
    'docker': 'ด็อกเกอร์ (Docker)',
    'ci/cd': 'ซีไอ/ซีดี (CI/CD)',
    'microservices': 'ไมโครเซอร์วิส (Microservices)',
    'scalable': 'สเกลอะเบิล (Scalable)',
    'architecture': 'อาร์คิเทคเจอร์ (Architecture)',
    'refactor': 'รีแฟกเตอร์ (Refactor)',
    'latency': 'แลเทนซี (Latency)',
    'throughput': 'ทรูพุต (Throughput)',
    'async': 'เอซิงค์ (Async)',
    'restful api': 'เรสท์ฟูล เอพีไอ (RESTful API)',
    'websocket': 'เว็บซ็อกเก็ต (WebSocket)',
    'graphql': 'กราฟคิวแอล (GraphQL)',
    'oauth': 'โออัท (OAuth)',
    'postgresql': 'โพสต์เกรสคิวแอล (PostgreSQL)',
    'redis': 'เรดิส (Redis)',
  };

  for (const [term, thai] of Object.entries(commonMap)) {
    if (!map.has(term)) {
      map.set(term, thai);
    }
  }

  for (const [term, thai] of map.entries()) {
    const escaped = term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b(?!\\s*\\([ก-๙])`, 'gi');
    processed = processed.replace(regex, `${thai}`);
  }

  return processed;
}

/**
 * Checks if two questions are duplicates or near-identical
 */
export function isDuplicateQuestion(q1: string, q2: string): boolean {
  if (!q1 || !q2) return false;
  const clean1 = q1.toLowerCase().replace(/[^a-z0-9ก-๙]/g, '');
  const clean2 = q2.toLowerCase().replace(/[^a-z0-9ก-๙]/g, '');

  if (clean1 === clean2) return true;
  if (clean1.length > 8 && clean2.length > 8) {
    if (clean1.includes(clean2) || clean2.includes(clean1)) return true;
  }

  return false;
}
