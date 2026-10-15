import { answerSections, sectionHeaders } from '../../shared/markdown';
import type { SmartAnswer } from '../../shared/contracts';

export function parseStreamedAnswer(raw: string, base: SmartAnswer): SmartAnswer {
  const sections = answerSections(raw),
    headers = sectionHeaders(raw);
  const risk = sections.RISK_LEVEL?.trim().toUpperCase();
  const pronunciations = (sections.PRONUNCIATION || '').split('\n').flatMap((line) => {
    const match = line.replace(/^[-*•]\s*/, '').match(/^([^:]+):\s*(.+)$/);
    return match ? [{ term: match[1].trim(), thai: match[2].trim() }] : [];
  });
  return {
    ...base,
    rawMarkdown: raw,
    riskLevel: risk === 'HIGH' || risk === 'LOW' || risk === 'MEDIUM' ? risk : base.riskLevel,
    riskSummary: sections.RISK_SUMMARY || '',
    directAnswer:
      sections.DIRECT_ANSWER || (!headers.length ? raw.replace(/\n?#{1,3}\s*\[?[^\n]*$/, '') : ''),
    exampleScript: sections.EXAMPLE_SCRIPT || '',
    howItWorks: sections.HOW_IT_WORKS || sections.EXPLANATION || '',
    commonPitfalls: sections.COMMON_PITFALLS || sections.RISKS || '',
    solutions: sections.SOLUTIONS || sections.OPTIONS || '',
    executiveSummary: sections.EXECUTIVE_SUMMARY || '',
    questionIntent: sections.QUESTION_INTENT || '',
    assumptions: sections.ASSUMPTIONS || '',
    clarifyingQuestions: sections.CLARIFYING_QUESTIONS || '',
    reasoningSteps: sections.REASONING_STEPS || '',
    validationSteps: sections.VALIDATION_STEPS || '',
    followUpQuestions: sections.FOLLOW_UP_QUESTIONS || '',
    solutionCode: sections.SOLUTION_CODE || '',
    pronunciations,
  };
}
export function isDuplicateQuestion(a: string, b: string) {
  const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const first = normalize(a),
    second = normalize(b);
  return !!first && first === second;
}
