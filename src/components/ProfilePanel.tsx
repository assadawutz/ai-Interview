import { useEffect, useRef, useState } from 'react';
import { Upload, Search, Save, ExternalLink, LoaderCircle, BriefcaseBusiness } from 'lucide-react';
import { contextSchema, type CandidateContext } from '../../shared/contracts';
import { StoryBank } from './StoryBank';
import { fileBase64, request } from '../lib/api';
export function ProfilePanel({
  context,
  language,
  onSave,
  notify,
  documentsAvailable = true,
  searchAvailable = true,
}: {
  documentsAvailable?: boolean;
  searchAvailable?: boolean;
  context: CandidateContext;
  language: 'th' | 'en';
  onSave: (context: CandidateContext) => void;
  notify: (message: string) => void;
}) {
  const [form, setForm] = useState(context),
    [busy, setBusy] = useState(''),
    [intel, setIntel] = useState<{
      text: string;
      sources: { title: string; uri: string }[];
    } | null>(null);
  const operation = useRef(0);
  const token = useRef<AbortController | null>(null);
  useEffect(() => {
    setForm(context);
    return () => {
      operation.current++;
      token.current?.abort();
    };
  }, [context]);
  const t = (th: string, en: string) => (language === 'th' ? th : en);
  const upload = async (file: File | undefined, fileType: 'resume' | 'jd') => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      notify(t('ไฟล์ต้องไม่เกิน 3 MB', 'Maximum file size is 3 MB.'));
      return;
    }
    if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      notify(t('รองรับ PDF, PNG, JPEG และ WebP', 'Supported: PDF, PNG, JPEG and WebP.'));
      return;
    }
    const id = ++operation.current;
    token.current?.abort();
    const controller = new AbortController();
    token.current = controller;
    setBusy(fileType);
    try {
      const data = await fileBase64(file);
      const result = await request<{ analysis: string }>(
        'analyze-doc',
        { data, mimeType: file.type, fileType, language },
        controller.signal,
      );
      if (id === operation.current) {
        setForm((prev) => ({
          ...prev,
          [fileType]: result.analysis,
          ...(fileType === 'jd' ? { jdFileName: file.name } : {}),
        }));
        notify(
          t('สกัดข้อมูลแล้ว กรุณาตรวจสอบก่อนบันทึก', 'Extracted. Review the facts before saving.'),
        );
      }
    } catch (error) {
      if (!controller.signal.aborted)
        notify(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      if (id === operation.current) setBusy('');
    }
  };
  const search = async () => {
    setBusy('search');
    token.current?.abort();
    const controller = new AbortController();
    token.current = controller;
    try {
      setIntel(
        await request(
          'search-company-intel',
          {
            context: form,
            companyName: form.targetCompany,
            companyWebsiteUrl: form.companyWebsiteUrl,
            companyLinkedInUrl: form.companyLinkedInUrl,
            language,
          },
          controller.signal,
        ),
      );
    } catch (error) {
      if (!controller.signal.aborted)
        notify(error instanceof Error ? error.message : 'Search failed.');
    } finally {
      setBusy('');
    }
  };
  return (
    <section className="panel profile-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <BriefcaseBusiness size={14} /> CANDIDATE PROFILE
          </span>
          <h2>{t('คำตอบที่เริ่มจากตัวคุณ', 'Good answers start with you.')}</h2>
          <p className="muted">
            {t(
              'ใส่ข้อมูลจริงเพื่อให้คำแนะนำตรงกับตำแหน่งและประสบการณ์',
              'Use real experience to personalize your interview coaching.',
            )}
          </p>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const result = contextSchema.safeParse(form);
          if (!result.success) {
            notify(t('ตรวจสอบความยาวข้อความและ URL', 'Check text lengths and website URLs.'));
            return;
          }
          onSave(result.data);
          notify(t('บันทึกโปรไฟล์แล้ว', 'Profile saved.'));
        }}
      >
        <div className="form-grid">
          <label>
            {t('ตำแหน่งเป้าหมาย', 'Target role')}
            <input
              value={form.role}
              maxLength={200}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="Senior Software Engineer"
            />
          </label>
          <label>
            {t('บริษัท', 'Company')}
            <input
              value={form.targetCompany}
              maxLength={200}
              onChange={(e) => setForm({ ...form, targetCompany: e.target.value })}
              placeholder={t('ชื่อบริษัทที่คุณสนใจ', 'Your target company')}
            />
          </label>
          <label>
            {t('เว็บไซต์บริษัท', 'Company website')}
            <input
              type="url"
              value={form.companyWebsiteUrl}
              onChange={(e) => setForm({ ...form, companyWebsiteUrl: e.target.value })}
              placeholder="https://company.com"
            />
          </label>
          <label>
            LinkedIn
            <input
              type="url"
              value={form.companyLinkedInUrl}
              onChange={(e) => setForm({ ...form, companyLinkedInUrl: e.target.value })}
              placeholder="https://linkedin.com/company/…"
            />
          </label>
        </div>
        <div className="research-bar">
          <p className="micro muted">
            {t(
              'ค้นหาผลิตภัณฑ์ วัฒนธรรมองค์กร และคำถามที่ควรถามกลับ',
              'Research products, company culture and questions to ask.',
            )}
          </p>
          <button
            type="button"
            className="button"
            disabled={!!busy || !searchAvailable || !form.targetCompany.trim()}
            onClick={search}
          >
            {busy === 'search' ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}{' '}
            {t('ค้นหาข้อมูลบริษัท', 'Research company')}
          </button>
        </div>
        {(!documentsAvailable || !searchAvailable) && (
          <p className="micro muted">
            {t(
              'การอ่านไฟล์และค้นเว็บต้องใช้ Gemini และปิดโหมดฟรีล้วน คุณยังวางข้อความประสบการณ์และ JD ได้',
              'File extraction and web research require Gemini with free-only mode off. You can still paste your experience and JD.',
            )}
          </p>
        )}
        {intel && (
          <div className="research-result">
            <p>{intel.text}</p>
            <div className="sources">
              {intel.sources.map((s) => (
                <a href={s.uri} key={s.uri} target="_blank" rel="noopener noreferrer">
                  {s.title}
                  <ExternalLink size={12} />
                </a>
              ))}
            </div>
          </div>
        )}
        {(['resume', 'jd'] as const).map((field) => (
          <label className="document-field" key={field}>
            <span className="field-heading">
              <strong>
                {field === 'resume'
                  ? t('ประสบการณ์และผลงานจริง', 'Resume & real achievements')
                  : t('รายละเอียดตำแหน่งงาน', 'Job description')}
              </strong>
              <span className={`upload-button ${busy ? 'disabled' : ''}`}>
                <Upload size={14} />
                {busy === field
                  ? t('กำลังอ่าน…', 'Reading…')
                  : t('อัปโหลดเอกสาร', 'Upload document')}
                <input
                  type="file"
                  aria-label={
                    field === 'resume'
                      ? t('อัปโหลด Resume', 'Upload resume')
                      : t('อัปโหลด JD', 'Upload job description')
                  }
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  disabled={!!busy || !documentsAvailable}
                  onChange={(e) => {
                    void upload(e.target.files?.[0], field);
                    e.target.value = '';
                  }}
                />
              </span>
            </span>
            <textarea
              aria-label={
                field === 'resume'
                  ? t('ประสบการณ์และผลงานจริง', 'Resume & real achievements')
                  : t('รายละเอียดตำแหน่งงาน', 'Job description')
              }
              rows={7}
              disabled={busy === field}
              maxLength={30000}
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              placeholder={
                field === 'resume'
                  ? t(
                      'ทักษะ โครงการ บทบาท และผลลัพธ์ที่ตรวจสอบได้…',
                      'Skills, projects, your contributions and verified outcomes…',
                    )
                  : t('วางรายละเอียดงานและคุณสมบัติ…', 'Paste the role requirements…')
              }
            />
          </label>
        ))}
        <label>
          {t('จุดเด่นและข้อมูลเพิ่มเติม', 'Highlights & additional context')}
          <textarea
            aria-label={t('จุดเด่นและข้อมูลเพิ่มเติม', 'Highlights & additional context')}
            rows={3}
            maxLength={10000}
            value={form.coverLetter}
            onChange={(e) => setForm({ ...form, coverLetter: e.target.value })}
          />
        </label>
        <StoryBank
          stories={form.stories}
          onChange={(stories) => setForm({ ...form, stories })}
          language={language}
        />
        <div className="form-footer">
          <p className="micro muted">
            {t(
              'เอกสารที่อัปโหลดจะถูกส่งให้ Gemini เพื่อวิเคราะห์',
              'Uploaded documents are sent to Gemini for analysis.',
            )}
          </p>
          <button className="button primary" disabled={!!busy}>
            <Save size={16} />
            {t('บันทึกโปรไฟล์', 'Save profile')}
          </button>
        </div>
      </form>
    </section>
  );
}
