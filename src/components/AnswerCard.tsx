import { useState } from 'react';
import {
  Copy,
  Check,
  Volume2,
  RotateCcw,
  ExternalLink,
  Sparkles,
  ChevronDown,
  ShieldAlert,
  LoaderCircle,
} from 'lucide-react';
import type { SmartAnswer } from '../../shared/contracts';
export function AnswerCard({
  answer,
  language,
  onSpeak,
  onRegenerate,
  notify,
  stale = false,
}: {
  answer: SmartAnswer;
  language: 'th' | 'en';
  onSpeak: (text: string) => void;
  onRegenerate: (tone: string) => void;
  notify: (message: string) => void;
  stale?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const t = (th: string, en: string) => (language === 'th' ? th : en);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${answer.question}\n\n${answer.rawMarkdown}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify(
        t(
          'คัดลอกไม่ได้ กรุณาเลือกข้อความแล้วคัดลอกด้วยตนเอง',
          'Clipboard unavailable. Select and copy the text manually.',
        ),
      );
    }
  };
  return (
    <article className="answer-card">
      <div className="answer-eyebrow">
        <span className="eyebrow">
          <Sparkles size={14} /> {t('แนวทางคำตอบ', 'YOUR ANSWER BRIEF')}
        </span>
        <span
          className={`status-tag ${answer.isStreaming ? 'live' : answer.isLocked ? 'success' : 'warning'}`}
        >
          {answer.isStreaming ? <LoaderCircle size={12} className="spin" /> : null}
          {answer.isStreaming
            ? t('กำลังเขียน', 'Writing')
            : answer.isLocked
              ? t('เสร็จแล้ว', 'Complete')
              : t('ยังไม่สมบูรณ์', 'Incomplete')}
        </span>
      </div>
      <h2>{answer.question}</h2>
      {stale && (
        <div className="answer-context-warning" role="status">
          {t(
            'บริบทหรือการตั้งค่าเปลี่ยนแล้ว คำตอบนี้อ้างอิงข้อมูลเดิม กดสร้างใหม่เพื่อใช้ข้อมูลล่าสุด',
            'Context or settings changed. This answer uses earlier inputs; regenerate to use the latest profile.',
          )}
        </div>
      )}
      <div className="answer-main">
        <span className="eyebrow muted">{t('เปิดประเด็นให้ตรงจุด', 'START WITH THIS')}</span>
        <p>{answer.directAnswer || t('กำลังเตรียมคำตอบ…', 'Preparing your answer…')}</p>
      </div>
      <section
        className={`review-panel review-${answer.review?.verdict || answer.reviewStatus}`}
        aria-label={t('ผลตรวจคำตอบด้วย AI', 'AI answer review')}
      >
        <strong>
          {answer.reviewStatus === 'pending'
            ? t('ร่างคำตอบ · รอการตรวจความสอดคล้อง', 'Draft · consistency review pending')
            : answer.reviewStatus === 'complete'
              ? answer.review?.verdict === 'consistent'
                ? t('AI ไม่พบข้อขัดแย้งในรอบตรวจนี้', 'No inconsistency found in this AI review')
                : t(
                    'ผลตรวจ: มีข้อมูลที่ต้องแก้หรือยืนยันก่อนใช้',
                    'Review: resolve concerns or missing evidence before use',
                  )
              : answer.reviewStatus === 'unavailable'
                ? t('ยังตรวจคำตอบซ้ำไม่สำเร็จ', 'Consistency review unavailable')
                : t('ไม่ได้เปิดการตรวจคำตอบซ้ำ', 'Consistency review is off')}
        </strong>
        {answer.originalDraft && (
          <p>
            <strong>
              {t('ปรับร่างคำตอบจากผลตรวจแล้ว', 'The draft was revised after review.')}
            </strong>
          </p>
        )}
        {answer.review && (
          <>
            <p>{answer.review.summary}</p>
            {answer.review.concerns.length > 0 && (
              <ul>
                {answer.review.concerns.map((item, i) => (
                  <li key={i}>
                    <strong>
                      {item.severity === 'critical'
                        ? t('ควรแก้ก่อนใช้', 'Resolve before using')
                        : t('ควรตรวจสอบ', 'Check')}
                      :{' '}
                    </strong>
                    {item.claim && <span>“{item.claim}” — </span>}
                    {item.reason}
                  </li>
                ))}
              </ul>
            )}
            {answer.review.missingInformation.length > 0 && (
              <div>
                <h3>{t('ข้อมูลที่ยังต้องถามหรือยืนยัน', 'Information to clarify')}</h3>
                <ul>
                  {answer.review.missingInformation.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {answer.review.evidence.length > 0 && (
              <details>
                <summary>
                  {t('หลักฐานที่ตรงกับข้อมูลที่ให้ไว้', 'Matching evidence from your inputs')} (
                  {answer.review.evidence.length})
                </summary>
                {answer.review.evidence.map((item, i) => (
                  <blockquote key={i}>
                    <span>{item.source}</span>
                    <p>“{item.quote}”</p>
                    <small>{item.relevance}</small>
                  </blockquote>
                ))}
              </details>
            )}
          </>
        )}
        <p className="micro">
          {t(
            'เป็นการตรวจโดย AI ไม่ใช่การยืนยันจากผู้เชี่ยวชาญหรือการทดสอบโค้ดจริง ตรวจสมมติฐานและหลักฐานก่อนนำไปใช้',
            'This AI review is not expert verification or executed code testing. Check assumptions and evidence before using the answer.',
          )}
        </p>
      </section>
      {answer.clarifyingQuestions && (
        <section className="clarification-panel">
          <h3>{t('ถามให้ชัดก่อนตอบ', 'Clarify before answering')}</h3>
          <p>{answer.clarifyingQuestions}</p>
        </section>
      )}
      {answer.riskSummary && (
        <div className={`risk-note risk-${answer.riskLevel.toLowerCase()}`}>
          <ShieldAlert size={17} />
          <div>
            <strong>
              {t('จุดที่ควรระวัง', 'Watch out')} · {answer.riskLevel}
            </strong>
            <p>{answer.riskSummary}</p>
          </div>
        </div>
      )}
      {answer.executiveSummary && (
        <div className="takeaway">
          <span className="eyebrow">{t('จำประเด็นนี้ไว้', 'KEY TAKEAWAY')}</span>
          <p>{answer.executiveSummary}</p>
        </div>
      )}
      {answer.exampleScript && (
        <section className="script">
          <h3>{t('ตัวอย่างบทพูด', 'Suggested script')}</h3>
          <p className="micro muted">
            {t(
              'ตรวจสอบให้ตรงกับประสบการณ์จริงของคุณก่อนนำไปใช้',
              'Check every claim against your actual experience before using it.',
            )}
          </p>
          <blockquote>{answer.exampleScript}</blockquote>
        </section>
      )}
      {answer.originalDraft && (
        <details className="answer-detail">
          <summary>
            {t('ดูร่างก่อนตรวจ · อาจมีข้อผิดพลาด', 'Original draft · may contain errors')}
            <ChevronDown size={16} />
          </summary>
          <p>{answer.originalDraft}</p>
        </details>
      )}
      {answer.solutionCode && (
        <section className="solution-code">
          <h3>{t('ตัวอย่างวิธีแก้ / โค้ด', 'Suggested solution / code')}</h3>
          <p className="micro muted">
            {t(
              'ตัวอย่างนี้ยังไม่ได้รัน ต้องตรวจและทดสอบในสภาพแวดล้อมที่เหมาะสม',
              'This example has not been executed. Review and test it in the appropriate environment.',
            )}
          </p>
          <pre>
            <code>{answer.solutionCode}</code>
          </pre>
        </section>
      )}
      {[
        {
          title: t('โจทย์กำลังถามอะไร', 'Understanding the question'),
          text: answer.questionIntent,
        },
        {
          title: t('สมมติฐานและข้อจำกัด', 'Assumptions and constraints'),
          text: answer.assumptions,
        },
        {
          title: t('วิธีคิดและขั้นตอนแก้โจทย์', 'Reasoning and solution steps'),
          text: answer.reasoningSteps,
        },
        {
          title: t('วิธีตรวจคำตอบและกรณีทดสอบ', 'Validation and edge cases'),
          text: answer.validationSteps,
        },
        {
          title: t('คำถามต่อยอดที่ควรเตรียม', 'Prepare for follow-ups'),
          text: answer.followUpQuestions,
        },
        {
          title: t('สิ่งที่ผู้สัมภาษณ์กำลังประเมิน', 'What the interviewer is evaluating'),
          text: answer.howItWorks,
        },
        { title: t('ข้อผิดพลาดที่ควรหลีกเลี่ยง', 'Common pitfalls'), text: answer.commonPitfalls },
        {
          title: t('วิธีตอบเมื่อยังไม่แน่ใจ', 'How to recover and clarify'),
          text: answer.solutions,
        },
      ]
        .filter((s) => s.text)
        .map((s) => (
          <details key={s.title} className="answer-detail">
            <summary>
              {s.title}
              <ChevronDown size={16} />
            </summary>
            <p>{s.text}</p>
          </details>
        ))}
      {answer.pronunciations.length > 0 && (
        <details className="answer-detail">
          <summary>
            {t('คำอ่านศัพท์เทคนิค', 'Pronunciation guide')}
            <ChevronDown size={16} />
          </summary>
          <div className="vocabulary">
            {answer.pronunciations.map((p, i) => (
              <div key={i}>
                <strong>{p.term}</strong>
                <span>{p.thai}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      {answer.webSources.length > 0 && (
        <div className="sources">
          <span className="eyebrow muted">{t('แหล่งอ้างอิง', 'SOURCES')}</span>
          {answer.webSources.map((s) => (
            <a key={s.uri} href={s.uri} target="_blank" rel="noopener noreferrer">
              {s.title}
              <ExternalLink size={12} />
            </a>
          ))}
        </div>
      )}
      <footer className="answer-footer">
        <div className="button-row">
          <button className="button small" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {t('คัดลอก', 'Copy')}
          </button>
          <button
            className="button small"
            onClick={() => onSpeak(answer.directAnswer)}
            disabled={
              !answer.directAnswer ||
              answer.isStreaming ||
              answer.review?.concerns.some((item) => item.severity === 'critical')
            }
          >
            <Volume2 size={14} />
            {t('ฟัง', 'Listen')}
          </button>
          <button
            className="button small"
            disabled={answer.isStreaming}
            onClick={() => onRegenerate('balanced')}
          >
            <RotateCcw size={14} />
            {t('สร้างใหม่', 'Regenerate')}
          </button>
          <button
            className="button small text-button"
            disabled={answer.isStreaming}
            onClick={() => onRegenerate('concise')}
          >
            {t('กระชับขึ้น', 'Make concise')}
          </button>
        </div>
        <div className="answer-meta">
          <span>{answer.modelUsed || '—'}</span>
          {answer.firstTokenMs !== undefined && (
            <span>
              {t('เริ่มตอบ', 'First text')} {(answer.firstTokenMs / 1000).toFixed(1)}s
            </span>
          )}
          {answer.reviewUsage && (
            <span>
              {t('ตรวจซ้ำ', 'Review')}:{' '}
              {(
                answer.reviewUsage.inputTokens +
                answer.reviewUsage.outputTokens +
                answer.reviewUsage.thinkingTokens
              ).toLocaleString()}{' '}
              tokens · {answer.reviewModel}
            </span>
          )}
          {answer.elapsedMs !== undefined && <span>{(answer.elapsedMs / 1000).toFixed(1)}s</span>}
          {answer.usage && (
            <span>
              {(
                answer.usage.inputTokens +
                answer.usage.outputTokens +
                answer.usage.thinkingTokens
              ).toLocaleString()}{' '}
              tokens
            </span>
          )}
          {answer.reviewCostUsd !== undefined && (
            <span>
              {t('ค่าตรวจซ้ำโดยประมาณ', 'Est. review cost')} ${answer.reviewCostUsd.toFixed(5)}
            </span>
          )}
          {answer.estimatedCostUsd !== undefined && (
            <span>≈ ${answer.estimatedCostUsd.toFixed(5)}</span>
          )}
        </div>
      </footer>
    </article>
  );
}
