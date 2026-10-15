import { useEffect, useRef, useState } from 'react';
import { Target, LoaderCircle, ArrowRight, RefreshCw } from 'lucide-react';
import {
  savedPreparationSchema,
  type CandidateContext,
  type PreparationPlan,
  type SavedPreparation,
} from '../../shared/contracts';
import { contextFingerprint } from '../../shared/fingerprint';
import { request } from '../lib/api';
export function PreparationPanel({
  context,
  language,
  saved,
  onSave,
  onQuestion,
  notify,
  canAI,
}: {
  context: CandidateContext;
  language: 'th' | 'en';
  saved?: SavedPreparation;
  onSave: (saved: SavedPreparation) => void;
  onQuestion: (question: string) => void;
  notify: (message: string) => void;
  canAI: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [stale, setStale] = useState(false);
  const token = useRef<AbortController | null>(null);
  const t = (th: string, en: string) => (language === 'th' ? th : en);
  useEffect(() => {
    let active = true;
    token.current?.abort();
    token.current = null;
    setBusy(false);
    void contextFingerprint(context, language).then((key) => {
      if (active) setStale(!!saved && key !== saved.contextFingerprint);
    });
    return () => {
      active = false;
      token.current?.abort();
    };
  }, [context, language, saved?.contextFingerprint]);
  const generate = async () => {
    const controller = new AbortController();
    token.current?.abort();
    token.current = controller;
    setBusy(true);
    try {
      const key = await contextFingerprint(context, language);
      const result = await request<{ plan: PreparationPlan; modelUsed: string }>(
        'preparation-plan',
        { context, language },
        controller.signal,
      );
      if (token.current !== controller || controller.signal.aborted) return;
      onSave(
        savedPreparationSchema.parse({
          ...result,
          contextFingerprint: key,
          language,
          createdAt: Date.now(),
        }),
      );
    } catch (error) {
      if (!controller.signal.aborted)
        notify(error instanceof Error ? error.message : 'Preparation plan failed.');
    } finally {
      if (token.current === controller) {
        token.current = null;
        setBusy(false);
      }
    }
  };
  return (
    <section className="preparation-panel">
      <div className="panel prep-intro">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              <Target size={15} /> ROLE-FIT PREPARATION
            </span>
            <h2>
              {t(
                'เตรียมให้ตรงงาน พิสูจน์ด้วยเรื่องจริง',
                'Prepare for the role. Back it with evidence.',
              )}
            </h2>
            <p className="muted">
              {t(
                'เชื่อมความต้องการใน JD กับประสบการณ์ ระบุข้อมูลที่ยังขาด และวางแผนฝึกที่ตรวจสอบผลได้',
                'Map job requirements to your experience, identify missing evidence and practice with observable goals.',
              )}
            </p>
          </div>
          <button
            className="button primary"
            disabled={busy || !canAI}
            onClick={() => void generate()}
          >
            {busy ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}{' '}
            {saved ? t('อัปเดตแผน', 'Refresh plan') : t('สร้างแผนเตรียมตัว', 'Build my plan')}
          </button>
        </div>
        {(!context.resume || !context.jd) && (
          <p className="plan-warning">
            {t(
              'ยังไม่มี Resume หรือ JD ครบทั้งสองส่วน แผนจะระบุข้อจำกัดและไม่เดาคุณสมบัติที่คุณไม่ได้ให้ไว้',
              'Resume or JD is missing. The plan will explain its limits rather than invent requirements or experience.',
            )}
          </p>
        )}
        {stale && (
          <p className="plan-warning">
            {t(
              'โปรไฟล์หรือภาษาเปลี่ยนแล้ว แผนนี้อ้างอิงข้อมูลเก่า กรุณาอัปเดตแผน',
              'Profile or language changed. This plan uses earlier context; refresh it before relying on it.',
            )}
          </p>
        )}
        {saved ? (
          <>
            <p>{saved.plan.summary}</p>
            <p className="micro muted">
              {t('สร้างเมื่อ', 'Generated')} {new Date(saved.createdAt).toLocaleString()} ·{' '}
              {saved.modelUsed}
            </p>
          </>
        ) : (
          <div className="quiet-empty">
            <Target size={30} />
            <h3>
              {t('เปลี่ยน JD เป็นแผนลงมือทำ', 'Turn the job description into a practice plan.')}
            </h3>
            <p>
              {t(
                'เริ่มจากเพิ่มโปรไฟล์และประสบการณ์จริง แล้วสร้างแผน',
                'Add your profile and real experience, then build a plan.',
              )}
            </p>
          </div>
        )}
      </div>
      {saved && (
        <>
          <div className="requirements-grid">
            {saved.plan.requirements.map((item, index) => (
              <article className="panel requirement-card" key={index}>
                <div className="requirement-tags">
                  <span>
                    {
                      {
                        must_have: t('จำเป็นตาม JD', 'JD must-have'),
                        nice_to_have: t('ข้อได้เปรียบตาม JD', 'JD nice-to-have'),
                        inferred: t('ข้อเสนอจาก AI', 'AI inference'),
                      }[item.priority]
                    }
                  </span>
                  <span className={`evidence-status ${item.status}`}>
                    {
                      {
                        evidence_available: t('มีหลักฐานในโปรไฟล์', 'Profile evidence'),
                        partial: t('มีข้อมูลบางส่วน', 'Partial evidence'),
                        not_provided: t('ยังไม่พบหลักฐาน', 'Not yet evidenced'),
                      }[item.status]
                    }
                  </span>
                </div>
                <h3>{item.requirement}</h3>
                {item.evidence.map((proof, i) => (
                  <blockquote key={i}>
                    <span>
                      {proof.source}
                      {proof.storyId
                        ? ` · ${context.stories.find((story) => story.id === proof.storyId)?.title || proof.storyId}`
                        : ''}
                    </span>
                    <p>“{proof.quote}”</p>
                    <small>{proof.relevance}</small>
                  </blockquote>
                ))}
                {item.gap && <p>{item.gap}</p>}
                <button className="text-button" onClick={() => onQuestion(item.practiceQuestion)}>
                  {item.practiceQuestion}
                  <ArrowRight size={14} />
                </button>
              </article>
            ))}
          </div>
          <section className="panel practice-plan">
            <h2>{t('แผนฝึกแบบมีเป้าหมาย', 'Your focused practice plan')}</h2>
            {saved.plan.plan.map((day, index) => (
              <article key={index}>
                <span className="plan-day">
                  {t('วัน', 'DAY')} {day.day}
                </span>
                <div>
                  <h3>{day.focus}</h3>
                  <ul>
                    {day.actions.map((action, i) => (
                      <li key={i}>{action}</li>
                    ))}
                  </ul>
                  <p>
                    <strong>{t('ตรวจผลด้วย', 'Success check')}: </strong>
                    {day.successCheck}
                  </p>
                </div>
              </article>
            ))}
          </section>
          <div className="plan-bottom">
            <section className="panel">
              <h3>{t('คำถามที่ควรถามบริษัท', 'Questions to ask the company')}</h3>
              <ul>
                {saved.plan.questionsToAsk.map((question, i) => (
                  <li key={i}>{question}</li>
                ))}
              </ul>
            </section>
            <section className="panel">
              <h3>{t('ข้อมูลที่ควรเติม', 'Information to add')}</h3>
              <ul>
                {saved.plan.missingInformation.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
              <p className="micro muted">
                {t(
                  'การไม่พบหลักฐานไม่ได้หมายความว่าคุณไม่มีทักษะนั้น และแผนนี้ไม่ใช่การคาดการณ์ผลการสมัคร',
                  'Missing evidence does not mean missing ability. This plan does not predict hiring outcomes.',
                )}
              </p>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
