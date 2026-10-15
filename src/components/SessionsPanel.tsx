import { useEffect, useRef, useState } from 'react';
import { Archive, Download, Upload, Trash2, ArrowUpRight, Save, FileText } from 'lucide-react';
import type { InterviewSession, Settings } from '../../shared/contracts';
import { downloadJson } from '../lib/api';
import { parseSession, recoveryBackup } from '../lib/storage';
export function SessionsPanel({
  sessions,
  settings,
  language,
  currentTitle,
  onSettings,
  onSave,
  onRestore,
  onDelete,
  onWipe,
  notify,
}: {
  sessions: InterviewSession[];
  settings: Settings;
  language: 'th' | 'en';
  currentTitle: string;
  onSettings: (settings: Settings) => void;
  onSave: (title: string) => void;
  onRestore: (session: InterviewSession) => boolean;
  onDelete: (id: string) => void;
  onWipe: () => void;
  notify: (message: string) => void;
}) {
  const [title, setTitle] = useState(currentTitle);
  const previousTitle = useRef(currentTitle);
  useEffect(() => {
    const previous = previousTitle.current;
    setTitle((value) => (value === previous ? currentTitle : value));
    previousTitle.current = currentTitle;
  }, [currentTitle]);
  const file = useRef<HTMLInputElement>(null);
  const t = (th: string, en: string) => (language === 'th' ? th : en);
  return (
    <section className="panel sessions-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <Archive size={15} /> SESSION LIBRARY
          </span>
          <h2>{t('เก็บทุกการเตรียมตัวให้ต่อเนื่อง', 'Pick up where you left off.')}</h2>
          <p className="muted">
            {t(
              'ข้อมูลบันทึกในเบราว์เซอร์นี้ และจะถูกลบเมื่อหมดอายุขณะเปิดแอป',
              'Sessions stay in this browser and are removed after expiry while the app is open.',
            )}
          </p>
        </div>
        <button className="button" onClick={() => file.current?.click()}>
          <Upload size={15} />
          {t('นำเข้า JSON', 'Import JSON')}
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const selected = e.target.files?.[0];
            e.target.value = '';
            if (!selected) return;
            if (selected.size > 10 * 1024 * 1024) {
              notify(t('ไฟล์ต้องไม่เกิน 10 MB', 'Maximum import size is 10 MB.'));
              return;
            }
            try {
              const session = parseSession(JSON.parse(await selected.text()));
              if (onRestore(session)) notify(t('นำเข้าเซสชันแล้ว', 'Session imported.'));
            } catch {
              notify(
                t(
                  'ไฟล์เซสชันไม่ถูกต้อง กรุณาใช้ JSON ที่ส่งออกจากเวอร์ชันนี้',
                  'Invalid session file. Use JSON exported by this version.',
                ),
              );
            }
          }}
        />
      </div>
      <form
        className="save-session"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) {
            notify(t('กรุณาตั้งชื่อเซสชัน', 'Enter a session title.'));
            return;
          }
          onSave(title.trim());
        }}
      >
        <label>
          {t('บันทึกเซสชันปัจจุบัน', 'Save the current session')}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={250}
            required
            placeholder={t(
              'เช่น สัมภาษณ์ Frontend · บริษัท A',
              'e.g. Frontend interview · Company A',
            )}
          />
        </label>
        <button className="button primary">
          <Save size={15} />
          {t('บันทึก', 'Save session')}
        </button>
      </form>
      <div className="session-preferences">
        <label className="switch-label">
          <input
            type="checkbox"
            checked={settings.autosave}
            onChange={(e) => onSettings({ ...settings, autosave: e.target.checked })}
          />
          <span>{t('กู้คืนงานอัตโนมัติหลังรีเฟรช', 'Automatically restore after refresh')}</span>
        </label>
        <label>
          {t('เก็บข้อมูลนาน', 'Retention')}
          <select
            value={settings.autoExpireHours}
            onChange={(e) => onSettings({ ...settings, autoExpireHours: Number(e.target.value) })}
          >
            <option value={1}>{t('1 ชั่วโมง', '1 hour')}</option>
            <option value={24}>{t('24 ชั่วโมง', '24 hours')}</option>
            <option value={168}>{t('7 วัน', '7 days')}</option>
            <option value={720}>{t('30 วัน', '30 days')}</option>
          </select>
        </label>
      </div>
      <div className="session-list">
        {sessions.length === 0 ? (
          <div className="quiet-empty">
            <FileText size={28} />
            <h3>{t('ยังไม่มีเซสชันที่บันทึก', 'Your library is ready.')}</h3>
            <p>
              {t(
                'เริ่มด้วยการบันทึกเซสชัน หรือนำเข้าไฟล์ JSON',
                'Save a session or import an exported JSON file.',
              )}
            </p>
          </div>
        ) : (
          sessions.map((s) => (
            <article className="session-row" key={s.id}>
              <div className="session-icon">
                <FileText size={20} />
              </div>
              <div className="session-info">
                <h3>{s.title}</h3>
                <p>
                  {s.context.role || t('ยังไม่ระบุตำแหน่ง', 'No role set')} · {s.questions.length}{' '}
                  {t('คำถาม', 'questions')} · {s.practice.length} {t('รอบซ้อม', 'practice rounds')}
                </p>
                <span className="micro muted">
                  {new Date(s.lastUpdated).toLocaleString(language === 'th' ? 'th-TH' : 'en-US')} ·{' '}
                  {t('หมดอายุ', 'Expires')}{' '}
                  {new Date(s.lastUpdated + s.autoExpireHours * 3600000).toLocaleString(
                    language === 'th' ? 'th-TH' : 'en-US',
                  )}
                </span>
              </div>
              <div className="button-row">
                <button
                  className="icon-button"
                  aria-label={`${t('เปิด', 'Restore')} ${s.title}`}
                  onClick={() => onRestore(s)}
                >
                  <ArrowUpRight size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`${t('ส่งออก', 'Export')} ${s.title}`}
                  onClick={() => downloadJson(s, `interview-${s.id}.json`)}
                >
                  <Download size={17} />
                </button>
                <button
                  className="icon-button danger"
                  aria-label={`${t('ลบ', 'Delete')} ${s.title}`}
                  onClick={() => {
                    if (window.confirm(t('ลบเซสชันนี้?', 'Delete this session?'))) onDelete(s.id);
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
      <button
        className="button recovery-download"
        onClick={() => {
          try {
            downloadJson(recoveryBackup(localStorage), 'interview-local-recovery.json');
          } catch {
            notify(t('อ่านข้อมูลสำรองไม่ได้', 'Unable to read local storage.'));
          }
        }}
      >
        {t('ดาวน์โหลดข้อมูลดิบเพื่อกู้คืน', 'Download raw recovery backup')}
      </button>
      <div className="privacy-box">
        <div>
          <strong>{t('ควบคุมข้อมูลของคุณ', 'Your data, your control.')}</strong>
          <p className="micro muted">
            {t(
              'การล้างข้อมูลจะลบประวัติและงานที่กู้คืนได้จากเบราว์เซอร์นี้ ไม่ลบไฟล์ที่ดาวน์โหลดหรือข้อมูลที่ผู้ให้บริการ AI เก็บไว้',
              'Clearing removes saved sessions and drafts in this browser. Downloaded files and provider-held data are unaffected.',
            )}
          </p>
        </div>
        <button className="button danger" onClick={onWipe}>
          <Trash2 size={15} />
          {t('ล้างข้อมูลทั้งหมด', 'Clear all data')}
        </button>
      </div>
    </section>
  );
}
