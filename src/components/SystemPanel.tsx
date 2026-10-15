import { useEffect, useRef, useState } from 'react';
import {
  RefreshCw,
  KeyRound,
  Settings2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import type { Health } from '../../shared/contracts';
import { diagnosticsSchema } from '../../shared/contracts';
import { request, getAccessToken, setAccessToken } from '../lib/api';
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
  const [token, setToken] = useState(getAccessToken());
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
          <h2>{t('พร้อมใช้งานอย่างมั่นใจ', 'Know what’s connected.')}</h2>
        </div>
        <button className="button" onClick={onRefresh}>
          <RefreshCw size={15} />
          {t('ตรวจสอบใหม่', 'Refresh status')}
        </button>
      </div>
      <div className="system-checks">
        <div>
          <span className={`system-dot ${health ? 'good' : ''}`} />
          <strong>{t('เซิร์ฟเวอร์', 'Server')}</strong>
          <span>
            {health ? t('เชื่อมต่อแล้ว', 'Connected') : t('เชื่อมต่อไม่ได้', 'Unavailable')}
          </span>
        </div>
        <div>
          <span className={`system-dot ${health?.hasApiKey ? 'good' : ''}`} />
          <strong>Gemini API</strong>
          <span>
            {health?.hasApiKey
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
      {!health?.hasApiKey && (
        <div className="setup-guide">
          <AlertCircle size={20} />
          <div>
            <h3>{t('เปิดใช้งาน AI', 'Enable AI features')}</h3>
            <ol>
              <li>
                {t(
                  'คัดลอก .env.example เป็น .env บนเซิร์ฟเวอร์',
                  'Copy .env.example to .env on the server.',
                )}
              </li>
              <li>
                {t('ตั้งค่า GEMINI_API_KEY ด้วย key ของคุณ', 'Set GEMINI_API_KEY to your own key.')}
              </li>
              <li>
                {t('รีสตาร์ตเซิร์ฟเวอร์ด้วย npm run dev', 'Restart the server with npm run dev.')}
              </li>
            </ol>
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
              Google AI Studio <ExternalLink size={12} />
            </a>
            <p className="micro muted">
              {t(
                'อย่าวาง Gemini API key ในหน้าเว็บหรือไฟล์ที่ commit เข้า Git',
                'Keep the Gemini key on the server. Never put it in browser code or commit it to Git.',
              )}
            </p>
          </div>
        </div>
      )}
      {health?.requiresAccessToken && (
        <form
          className="token-form"
          onSubmit={(e) => {
            e.preventDefault();
            setAccessToken(token.trim());
            notify(
              t(
                'บันทึก token ในหน่วยความจำแล้ว จะหายเมื่อรีเฟรช',
                'Access token saved in memory. It clears on refresh.',
              ),
            );
          }}
        >
          <label>
            <KeyRound size={15} />
            {t('App access token', 'App access token')}
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button className="button primary">{t('ใช้ token นี้', 'Apply token')}</button>
        </form>
      )}
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
