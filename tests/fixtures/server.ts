/** Test-only provider boundary. Never imported by the application entry point. */
import path from 'node:path';
import express from 'express';
import { GenerateContentResponse, type GenerateContentParameters } from '@google/genai';
import { createApp, type Provider } from '../../server/app';
import { config } from '../../server/config';
if (process.env.INTERVIEW_TEST_MODE !== '1')
  throw new Error('Fixture server requires INTERVIEW_TEST_MODE=1.');
config.apiKey = '';
config.appUrl = '';
function text(value: string) {
  const response = new GenerateContentResponse();
  response.candidates = [{ content: { parts: [{ text: value }] }, finishReason: 'STOP' as never }];
  response.usageMetadata = { promptTokenCount: 10, candidatesTokenCount: 20 };
  return response;
}
function body(params: GenerateContentParameters): Record<string, unknown> {
  return typeof params.contents === 'string' ? JSON.parse(params.contents) : {};
}
const fixture: Provider = {
  async generate(params) {
    const instruction = String(params.config?.systemInstruction || '');
    const input = body(params);
    if (params.model === config.models.transcription)
      return text('How do you validate a migration?');
    if (params.config?.responseModalities?.includes('AUDIO')) {
      const response = new GenerateContentResponse();
      response.candidates = [
        {
          content: {
            parts: [{ inlineData: { data: 'AAAAAA==', mimeType: 'audio/L16;rate=24000' } }],
          },
        },
      ];
      return response;
    }
    if (instruction.includes('Review the draft against'))
      return text(
        JSON.stringify({
          verdict: 'needs_revision',
          summary: 'Removed an unsupported percentage; retained candidate-provided facts.',
          evidence: [
            {
              source: 'resume',
              quote: 'I led a TypeScript migration with two teams.',
              relevance: 'User-provided contribution',
            },
          ],
          concerns: [
            {
              severity: 'warning',
              claim: '80% improvement',
              reason: 'No metric supplied; replaced with the actual contribution.',
            },
          ],
          missingInformation: ['What was the measured outcome?'],
          revisedDirectAnswer: 'I led a TypeScript migration with two teams.',
          revisedExampleScript: 'I coordinated the migration. [Add your actual measured outcome.]',
        }),
      );
    if (instruction.includes('Build an actionable role-fit'))
      return text(
        JSON.stringify({
          summary: 'Prepare evidence for the target engineering role.',
          requirements: [
            {
              requirement: 'TypeScript delivery',
              priority: 'must_have',
              status: 'evidence_available',
              evidence: [
                {
                  source: 'resume',
                  quote: 'I led a TypeScript migration with two teams.',
                  relevance: 'Migration example',
                },
              ],
              gap: 'Add the measured result.',
              practiceQuestion: 'How did you validate the migration?',
            },
          ],
          plan: [
            {
              day: 1,
              focus: 'Explain your actual contribution',
              actions: ['Draft a STAR example', 'List migration checks'],
              successCheck: 'Explain the decisions and a verified result in two minutes.',
            },
          ],
          questionsToAsk: ['How does the team validate migrations?'],
          missingInformation: ['Measured outcomes'],
        }),
      );
    if (instruction.includes('conducting a mock interview'))
      return text(
        JSON.stringify(
          input.question
            ? {
                nextQuestion: 'How did you validate the result?',
                feedback: 'Your contribution is clear; add a real outcome.',
                scores: { relevance: 4, structure: 3, evidence: 3, clarity: 4 },
                strengths: ['Clear ownership'],
                improvements: ['Add a real measured result'],
                suggestedAnswer: 'I led the migration and verified [your actual outcome].',
              }
            : { nextQuestion: 'Tell me about a migration you led.' },
        ),
      );
    if (instruction.includes('Detect substantive'))
      return text(
        JSON.stringify({
          isQuestion: true,
          cleanQuestion: String(input.transcript),
          confidence: 95,
          category: 'technical',
          isDuplicate: false,
        }),
      );
    if (instruction.includes('Research this company')) {
      const response = text('The company research summary distinguishes facts from inference.');
      response.candidates![0].groundingMetadata = {
        groundingChunks: [{ web: { title: 'Company reference', uri: 'https://example.com' } }],
      };
      return response;
    }
    if (instruction.includes('Answer interview follow-ups'))
      return text('Explain your own contribution and use a real measurable outcome.');
    return text(JSON.stringify({ summary: 'I led a TypeScript migration with two teams.' }));
  },
  async stream() {
    return (async function* () {
      yield text(
        '# [DIRECT_ANSWER]\nI delivered an 80% improvement.\n# [QUESTION_INTENT]\nExplain ownership and outcomes.\n# [RISK_LEVEL]\nMEDIUM\n# [RISK_SUMMARY]\nDo not invent metrics.\n# [ASSUMPTIONS]\nThe target is an engineering role.\n# [CLARIFYING_QUESTIONS]\nWhat outcome was actually measured?\n# [HOW_IT_WORKS]\nUse a real example and explain decisions.\n# [VALIDATION_STEPS]\nCheck each claim against your project records.\n# [FOLLOW_UP_QUESTIONS]\nHow did you validate the result?\n# [EXECUTIVE_SUMMARY]\nUse concrete evidence.',
      );
    })();
  },
  async inspect(model) {
    return { name: model, supportedActions: ['generateContent'] };
  },
};
const app = createApp({ provider: fixture, accessToken: '' });
app.use(express.static(path.resolve('dist')));
app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
app.listen(3101, '127.0.0.1', () => console.log('Test-only fixture server http://127.0.0.1:3101'));
