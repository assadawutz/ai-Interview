import { useEffect, useRef, useState } from 'react';
import { RefreshCw, KeyRound, Settings2, CheckCircle2, ExternalLink } from 'lucide-react';
import type { Health } from '../../shared/contracts';
import { diagnosticsSchema } from '../../shared/contracts';
import {
  request,
  getGeminiKey,
  saveGeminiKey,
  clearGeminiKey,
  remembersGeminiKey,
} from '../lib/api';
import { Modal } from './Modal';
import { LLMSettings } from './LLMSettings';
export function SystemPanel({
  health,
  language,
  onRefresh,
  notify,
}: {
  health: Health | null;
  language: 'th' | 'en';
  onRefresh: () => void;
  notify: (message: string) => void;
}) {
  const [keyModal, setKeyModal] = useState(false);
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(remembersGeminiKey);
  const [visible, setVisible] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [diagnostics, setDiagnostics] = useState<ReturnType<typeof diagnosticsSchema.parse> | null>(
    null,
  );
  const [checking, setChecking] = useState(false);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const t = (th: string, en: string) => (language === 'th' ? th : en);
  return (
    <section className="panel system-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <Settings2 size={14} /> SYSTEM STATUS
          </span>
          <h2>{t('ตั้งค่า AI', 'Connect your AI.')}</h2>
        </div>
        <button className="button" onClick={onRefresh}>
          <RefreshCw size={15} />
          {t('ตรวจสอบใหม่', 'Refresh status')}
        </button>
      </div>
      <div className="system-checks">
        <div>
          <span className={`system-dot ${health ? 'good' : ''}`} />
          <strong>{t('รันไทม์เบราว์เซอร์', 'Browser runtime')}</strong>
          <span>
            {health ? t('เชื่อมต่อแล้ว', 'Connected') : t('เชื่อมต่อไม่ได้', 'Unavailable')}
          </span>
        </div>
        <div>
          <span className={`system-dot ${health?.hasApiKey ? 'good' : ''}`} />
          <strong>AI / LLM</strong>
          <span>
            {health?.catalogError
              ? health.catalogError
              : health?.hasApiKey
                ? t(
                    'ตั้งค่า key แล้ว · ยังไม่ได้ยืนยันสิทธิ์โมเดล',
                    'Key configured · model access unverified',
                  )
                : t('ต้องตั้งค่า GEMINI_API_KEY', 'Set GEMINI_API_KEY')}
          </span>
        </div>
        <div>
          <span className={`system-dot ${health?.requiresAccessToken ? 'good' : ''}`} />
          <strong>{t('การเข้าถึง', 'Access control')}</strong>
          <span>
            {health?.requiresAccessToken
              ? t('ใช้ app access token', 'App token required')
              : t(
                  'โหมดใช้งานส่วนตัว · ไม่ได้กำหนด token',
                  'Personal mode · no access token configured',
                )}
          </span>
        </div>
      </div>
      <div className="setup-guide">
        <KeyRound size={20} />
        <div>
          <h3>{t('เชื่อมต่อ Gemini ของคุณ', 'Connect your Gemini account')}</h3>
          <p>
            {t(
              'ใส่ API key แล้วเริ่มใช้งานได้โดยไม่ต้อง redeploy',
              'Add your API key to start without redeploying.',
            )}
          </p>
          <button
            className="button primary"
            onClick={() => {
              setKey('');
              setKeyError('');
              setVisible(false);
              setRemember(remembersGeminiKey());
              setKeyModal(true);
            }}
          >
            <KeyRound size={15} />
            {getGeminiKey()
              ? t('เปลี่ยน Gemini API key', 'Change Gemini API key')
              : t('เพิ่ม Gemini API key', 'Add Gemini API key')}
          </button>
          {getGeminiKey() && (
            <button
              className="button"
              onClick={() => {
                try {
                  clearGeminiKey();
                  setDiagnostics(null);
                  onRefresh();
                  notify(t('ลบ key จากเบราว์เซอร์แล้ว', 'Browser key removed.'));
                } catch {
                  notify(
                    t(
                      'ลบ key ไม่สำเร็จ กรุณาตรวจการอนุญาตพื้นที่จัดเก็บ',
                      'Unable to remove key. Check browser storage permissions.',
                    ),
                  );
                }
              }}
            >
              {t('ลบ key', 'Remove key')}
            </button>
          )}
        </div>
      </div>
      {keyModal && (
        <Modal
          title={t('ตั้งค่า Gemini API key', 'Gemini API key settings')}
          onClose={() => {
            setKeyModal(false);
            setKey('');
          }}
        >
          <form
            className="credential-form"
            onSubmit={(event) => {
              event.preventDefault();
              try {
                if (!key.trim()) {
                  setKeyError(t('กรุณาใส่ Gemini API key', 'Enter your Gemini API key.'));
                  return;
                }
                saveGeminiKey(key, remember);
                setKey('');
                setKeyModal(false);
                setDiagnostics(null);
                onRefresh();
                notify(
                  t(
                    'บันทึก key แล้ว กดตรวจข้อมูลโมเดลเพื่อทดสอบการเชื่อมต่อ',
                    'Key saved. Check provider model metadata to test access.',
                  ),
                );
              } catch (error) {
                setKeyError(error instanceof Error ? error.message : 'Unable to save key.');
              }
            }}
          >
            <p>
              {t(
                'โหมด client ส่ง key และข้อมูลที่เกี่ยวข้องตรงไปยัง Google ไม่มีเซิร์ฟเวอร์แอปเก็บข้อมูล key ไม่รวมในไฟล์ส่งออก หากเปิดจำ key จะใช้ localStorage ที่ไม่ได้เข้ารหัส',
                'Client mode sends the key and relevant input directly to Google. No app backend stores them. Keys are excluded from exports; remembered keys use unencrypted localStorage.',
              )}
            </p>
            <label htmlFor="gemini-api-key">Gemini API key</label>
            <input
              id="gemini-api-key"
              type={visible ? 'text' : 'password'}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setKeyError('');
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              aria-describedby="gemini-key-storage"
              aria-invalid={!!keyError}
            />
            <label className="credential-option">
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
              />
              {t('แสดง key', 'Show key')}
            </label>
            <label className="credential-option">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              {t('จำบนอุปกรณ์นี้', 'Remember on this device')}
            </label>
            <p id="gemini-key-storage" className="micro muted">
              {remember
                ? t(
                    'เก็บในเบราว์เซอร์จนกดลบ key อย่าใช้บนเครื่องที่ใช้ร่วมกัน',
                    'Stored in this browser until removed. Avoid this option on shared devices.',
                  )
                : t(
                    'เก็บเฉพาะแท็บนี้ รีเฟรชได้ และลบเมื่อปิดแท็บ',
                    'Saved for this tab, including reloads; cleared when the tab closes.',
                  )}
            </p>
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
              {t('สร้าง key ที่ Google AI Studio', 'Get a key from Google AI Studio')}{' '}
              <ExternalLink size={12} />
            </a>
            {keyError && <p role="alert">{keyError}</p>}
            <button className="button primary" type="submit">
              {t('บันทึกและใช้งาน', 'Save and use key')}
            </button>
          </form>
        </Modal>
      )}
      <LLMSettings
        language={language}
        localSupported={health?.localLLMSupported}
        onRefresh={onRefresh}
        notify={notify}
      />
      <div className="diagnostics-control">
        <button
          className="button"
          disabled={checking || !health?.hasApiKey}
          onClick={async () => {
            const controller = new AbortController();
            operation.current = controller;
            setChecking(true);
            try {
              setDiagnostics(
                diagnosticsSchema.parse(await request('diagnostics', {}, controller.signal)),
              );
            } catch (error) {
              if (!controller.signal.aborted)
                notify(error instanceof Error ? error.message : 'Model check failed.');
            } finally {
              if (operation.current === controller) {
                operation.current = null;
                setChecking(false);
              }
            }
          }}
        >
          {checking
            ? t('กำลังตรวจข้อมูลโมเดล…', 'Checking model metadata…')
            : t('ตรวจข้อมูลโมเดลจากผู้ให้บริการ', 'Check provider model metadata')}
        </button>
        <p className="micro muted">
          {t(
            'ตรวจว่าอ่านข้อมูลโมเดลได้ ไม่ได้ทดสอบการสร้างคำตอบหรือยืนยัน quota',
            'Checks model metadata access. It does not verify generation or quota.',
          )}
        </p>
      </div>
      {diagnostics && (
        <div className="diagnostics-results" role="status">
          {diagnostics.models.map((item) => (
            <div key={item.model}>
              <strong>{item.model}</strong>
              <span>
                {item.available
                  ? t('อ่านข้อมูลได้', 'Metadata accessible')
                  : t('ยังอ่านข้อมูลไม่ได้', 'Metadata unavailable')}
              </span>
              <p>{item.message}</p>
            </div>
          ))}
        </div>
      )}
      {health?.agentPlan && (
        <div className="diagnostics-results" role="status">
          <strong>{t('Agents ที่ใช้งาน · ฟรีเท่านั้น', 'Active agents · free only')}</strong>
          {Object.entries(health.agentPlan).map(([role, model]) => (
            <div key={role}>
              <strong>{role}</strong>
              <span>{model}</span>
            </div>
          ))}
        </div>
      )}
      <h3 className="subheading">{t('โมเดลที่ตั้งค่าไว้', 'Configured models')}</h3>
      <div className="model-list">
        {Object.entries(health?.models || {}).map(([key, value]) => (
          <div key={key}>
            <span>{key}</span>
            <code>{value}</code>
          </div>
        ))}
      </div>
      <p className="micro muted">
        {t(
          'สถานะนี้ตรวจการตั้งค่าเท่านั้น การเรียกใช้งานจริงขึ้นกับสิทธิ์และ quota ของบัญชี',
          'This checks configuration only. Live availability depends on account access and quota.',
        )}
      </p>
      <div className="system-notes">
        <CheckCircle2 size={18} />
        <p>
          {t(
            'แสดงจำนวน token และเวลาจากคำตอบจริง ค่าใช้จ่ายจะแสดงเมื่อผู้ดูแลตั้งอัตราราคาสำหรับโมเดลที่ใช้แล้วเท่านั้น ไม่รวมค่าเครื่องมือค้นหาหรือเสียง',
            'Token counts and response time come from completed requests. Cost estimates appear only when the operator configures pricing; search and audio charges are excluded.',
          )}
        </p>
      </div>
    </section>
  );
}
