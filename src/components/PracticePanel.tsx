import { useEffect, useRef, useState } from 'react';
import { ArrowRight, LoaderCircle, Mic, Send, RotateCcw, GraduationCap } from 'lucide-react';
import type { CandidateContext, PracticeTurn, Settings } from '../../shared/contracts';
import { request } from '../lib/api';
export function PracticePanel({
  context,
  language,
  turns,
  onTurns,
  draft,
  onDraft,
  notify,
  settings,
  onSettings,
}: {
  context: CandidateContext;
  language: 'th' | 'en';
  turns: PracticeTurn[];
  onTurns: (turns: PracticeTurn[]) => void;
  draft: { question: string; answer: string };
  onDraft: (draft: { question: string; answer: string }) => void;
  notify: (message: string) => void;
  settings: Settings;
  onSettings: (settings: Settings) => void;
}) {
  const { question, answer } = draft;
  const [busy, setBusy] = useState(false);
  const token = useRef<AbortController | null>(null);
  const t = (th: string, en: string) => (language === 'th' ? th : en);
  useEffect(() => {
    token.current?.abort();
    token.current = null;
    setBusy(false);
    return () => token.current?.abort();
  }, [context, language, settings.taskType, settings.practiceDifficulty]);
  const next = async () => {
    const controller = new AbortController();
    token.current?.abort();
    token.current = controller;
    setBusy(true);
    try {
      const data = await request<{
        nextQuestion: string;
        feedback?: string;
        scores?: PracticeTurn['scores'];
        strengths?: string[];
        improvements?: string[];
        suggestedAnswer?: string;
      }>(
        'practice',
        {
          context,
          language,
          taskType: settings.taskType,
          difficulty: settings.practiceDifficulty,
          question,
          answer,
          history: turns
            .slice(-20)
            .map((turn) => ({ question: turn.question, answer: turn.answer })),
        },
        controller.signal,
      );
      if (token.current !== controller || controller.signal.aborted) return;
      if (!data.nextQuestion?.trim() || (question && (!data.feedback || !data.scores)))
        throw new Error('Incomplete practice feedback. Your draft has been preserved.');
      if (question && data.feedback && data.scores)
        onTurns(
          [
            ...turns,
            {
              id: crypto.randomUUID(),
              question,
              answer,
              feedback: data.feedback,
              scores: data.scores,
              strengths: data.strengths || [],
              improvements: data.improvements || [],
              suggestedAnswer: data.suggestedAnswer || '',
            },
          ].slice(-100),
        );
      onDraft({ question: data.nextQuestion, answer: '' });
    } catch (error) {
      if (!controller.signal.aborted)
        notify(error instanceof Error ? error.message : 'Practice failed.');
    } finally {
      if (token.current === controller) {
        token.current = null;
        setBusy(false);
      }
    }
  };
  return (
    <div className="practice-layout">
      <section className="panel practice-main">
        <span className="eyebrow">
          <GraduationCap size={15} /> MOCK INTERVIEW
        </span>
        <h2>{t('ซ้อมให้พร้อม ก่อนวันจริง', 'A little practice. A lot more confidence.')}</h2>
        <p className="muted">
          {t(
            'ตอบด้วยประสบการณ์ของคุณ แล้วรับคำแนะนำตามเกณฑ์ที่ชัดเจน',
            'Answer in your own words and get specific, structured coaching.',
          )}
        </p>
        <div className="practice-options">
          <label>
            {t('ประเภทโจทย์', 'Question type')}
            <select
              value={settings.taskType}
              onChange={(e) =>
                onSettings({ ...settings, taskType: e.target.value as Settings['taskType'] })
              }
            >
              <option value="auto">{t('ตามตำแหน่ง', 'Role-based')}</option>
              <option value="technical">Technical</option>
              <option value="coding">Coding</option>
              <option value="system_design">System design</option>
              <option value="behavioral">Behavioral / STAR</option>
              <option value="case">Case / problem solving</option>
            </select>
          </label>
          <label>
            {t('ระดับการฝึก', 'Practice level')}
            <select
              value={settings.practiceDifficulty}
              onChange={(e) =>
                onSettings({
                  ...settings,
                  practiceDifficulty: e.target.value as Settings['practiceDifficulty'],
                })
              }
            >
              <option value="foundation">{t('พื้นฐาน', 'Foundation')}</option>
              <option value="intermediate">{t('ระดับกลาง', 'Intermediate')}</option>
              <option value="advanced">{t('เชิงลึก', 'Advanced')}</option>
            </select>
          </label>
        </div>
        {!question ? (
          <div className="practice-start">
            <div className="orb">
              <Mic size={32} />
            </div>
            <h3>{t('พื้นที่สำหรับลองและเรียนรู้', 'Your space to learn out loud.')}</h3>
            <p className="muted">
              {t(
                'AI จะถามตามตำแหน่งและโปรไฟล์ที่คุณบันทึกไว้',
                'Questions are tailored to your saved role and profile.',
              )}
            </p>
            <button className="button primary" disabled={busy} onClick={next}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}{' '}
              {t('เริ่มซ้อมสัมภาษณ์', 'Start practice')}
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void next();
            }}
          >
            <div className="practice-question">
              <span className="eyebrow muted">
                {t('คำถามถัดไป', 'YOUR NEXT QUESTION')} · {turns.length + 1}
              </span>
              <h3>{question}</h3>
            </div>
            <label>
              {t('คำตอบของคุณ', 'Your answer')}
              <textarea
                aria-label={t('คำตอบของคุณ', 'Your answer')}
                rows={9}
                maxLength={10000}
                value={answer}
                onChange={(e) => onDraft({ ...draft, answer: e.target.value })}
                placeholder={t(
                  'เล่าสถานการณ์ บทบาท สิ่งที่ทำ และผลลัพธ์…',
                  'Describe the situation, your role, your actions and the outcome…',
                )}
                required
                disabled={busy}
              />
            </label>
            <div className="form-footer">
              <span className="micro muted">{answer.length.toLocaleString()} / 10,000</span>
              <button className="button primary" disabled={busy || !answer.trim()}>
                {busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}{' '}
                {t('ประเมินและถามต่อ', 'Get feedback & continue')}
              </button>
            </div>
          </form>
        )}
        <p className="privacy-note">
          {t(
            'คะแนนนี้เป็นแนวทางฝึกฝนจาก AI ไม่ใช่การคาดการณ์ผลการสมัครงาน',
            'AI coaching scores are practice feedback, not a prediction of hiring outcomes.',
          )}
        </p>
      </section>
      <aside className="practice-history">
        <div className="section-heading">
          <h3>{t('บันทึกการฝึก', 'Practice notes')}</h3>
          {turns.length > 0 && (
            <button
              className="icon-button"
              aria-label={t('เริ่มใหม่', 'Reset practice')}
              onClick={() => {
                if (window.confirm(t('ล้างบันทึกการฝึก?', 'Clear practice history?'))) {
                  token.current?.abort();
                  token.current = null;
                  setBusy(false);
                  onTurns([]);
                  onDraft({ question: '', answer: '' });
                }
              }}
            >
              <RotateCcw size={16} />
            </button>
          )}
        </div>
        {turns.length === 0 ? (
          <div className="panel quiet-empty">
            {t(
              'คำแนะนำและคะแนนจะแสดงที่นี่หลังคุณตอบคำถาม',
              'Your feedback will appear here after your first answer.',
            )}
          </div>
        ) : (
          [...turns].reverse().map((turn, i) => (
            <article className="panel feedback-card" key={turn.id}>
              <span className="eyebrow muted">ROUND {turns.length - i}</span>
              <h3>{turn.question}</h3>
              <div className="score-grid">
                {Object.entries(turn.scores).map(([key, score]) => (
                  <div key={key}>
                    <strong>
                      {score}
                      <small>/5</small>
                    </strong>
                    <span>
                      {
                        (
                          {
                            relevance: t('ตรงประเด็น', 'Relevance'),
                            structure: t('โครงสร้าง', 'Structure'),
                            evidence: t('หลักฐาน', 'Evidence'),
                            clarity: t('ชัดเจน', 'Clarity'),
                          } as Record<string, string>
                        )[key]
                      }
                    </span>
                  </div>
                ))}
              </div>
              <p>{turn.feedback}</p>
              {turn.strengths.length > 0 && (
                <div>
                  <h4>{t('จุดที่ทำได้ดี', 'Strengths')}</h4>
                  <ul>
                    {turn.strengths.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {turn.improvements.length > 0 && (
                <div>
                  <h4>{t('ฝึกเพิ่มตรงนี้', 'Next improvements')}</h4>
                  <ul>
                    {turn.improvements.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {turn.suggestedAnswer && (
                <details>
                  <summary>{t('แนวทางปรับคำตอบ', 'Suggested revision')}</summary>
                  <p>{turn.suggestedAnswer}</p>
                </details>
              )}
              <details>
                <summary>{t('ดูคำตอบของฉัน', 'My answer')}</summary>
                <p>{turn.answer}</p>
              </details>
            </article>
          ))
        )}
      </aside>
    </div>
  );
}
