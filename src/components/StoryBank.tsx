import { Plus, Trash2, BookOpen } from 'lucide-react';
import type { ExperienceStory } from '../../shared/contracts';
export function StoryBank({
  stories,
  onChange,
  language,
}: {
  stories: ExperienceStory[];
  onChange: (stories: ExperienceStory[]) => void;
  language: 'th' | 'en';
}) {
  const t = (th: string, en: string) => (language === 'th' ? th : en);
  return (
    <section className="story-bank">
      <div className="section-heading">
        <div>
          <h3>
            <BookOpen size={16} />
            {t('คลังเรื่องเล่าจากประสบการณ์จริง', 'Your evidence & story bank')}
          </h3>
          <p className="micro muted">
            {t(
              'บันทึกสิ่งที่คุณทำจริง AI จะใช้เป็นหลักฐานประกอบคำตอบ แยกบทบาทคุณออกจากทีม และไม่เติมตัวเลขที่ไม่มี',
              'Record what you actually did. Separate your contribution from the team and include only real metrics.',
            )}
          </p>
        </div>
        <button
          type="button"
          className="button"
          disabled={stories.length >= 20}
          onClick={() =>
            onChange([
              ...stories,
              {
                id: crypto.randomUUID(),
                title: '',
                situation: '',
                task: '',
                action: '',
                result: '',
                skills: '',
              },
            ])
          }
        >
          <Plus size={14} />
          {t('เพิ่มเรื่องเล่า', 'Add story')}
        </button>
      </div>
      {stories.length === 0 && (
        <p className="story-empty">
          {t(
            'ยังไม่มีเรื่องเล่า เพิ่มโครงการหนึ่งเรื่องที่สะท้อนทักษะของคุณได้ชัดเจน',
            'Start with one project that clearly demonstrates your skills.',
          )}
        </p>
      )}
      {stories.map((story, index) => (
        <article className="story-entry" key={story.id}>
          <div className="story-heading">
            <span className="eyebrow">STORY {index + 1}</span>
            <button
              type="button"
              className="icon-button danger"
              aria-label={`${t('ลบเรื่องเล่า', 'Remove story')} ${index + 1}`}
              onClick={() => onChange(stories.filter((item) => item.id !== story.id))}
            >
              <Trash2 size={15} />
            </button>
          </div>
          <label>
            {t('ชื่อโครงการหรือเหตุการณ์', 'Project or situation title')}
            <input
              required
              maxLength={200}
              value={story.title}
              onChange={(e) =>
                onChange(
                  stories.map((item) =>
                    item.id === story.id ? { ...item, title: e.target.value } : item,
                  ),
                )
              }
            />
          </label>
          <div className="form-grid">
            {(
              [
                {
                  key: 'situation',
                  label: t('สถานการณ์ / ปัญหา', 'Situation / problem'),
                  max: 3000,
                },
                {
                  key: 'task',
                  label: t('หน้าที่ที่คุณรับผิดชอบ', 'Your responsibility'),
                  max: 3000,
                },
                {
                  key: 'action',
                  label: t('สิ่งที่คุณลงมือทำและเหตุผล', 'Your actions and decisions'),
                  max: 5000,
                },
                {
                  key: 'result',
                  label: t('ผลลัพธ์จริง / สิ่งที่ได้เรียนรู้', 'Actual outcome / lessons learned'),
                  max: 3000,
                },
              ] as const
            ).map((field) => (
              <label key={field.key}>
                {field.label}
                <textarea
                  aria-label={`${field.label} ${index + 1}`}
                  rows={3}
                  maxLength={field.max}
                  value={story[field.key]}
                  onChange={(e) =>
                    onChange(
                      stories.map((item) =>
                        item.id === story.id ? { ...item, [field.key]: e.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
            ))}
          </div>
          <label>
            {t('ทักษะที่ใช้', 'Skills demonstrated')}
            <input
              maxLength={1000}
              value={story.skills}
              onChange={(e) =>
                onChange(
                  stories.map((item) =>
                    item.id === story.id ? { ...item, skills: e.target.value } : item,
                  ),
                )
              }
            />
          </label>
        </article>
      ))}
    </section>
  );
}
