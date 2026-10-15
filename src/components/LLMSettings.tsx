import { useState } from 'react';
import { Network } from 'lucide-react';
import { Modal } from './Modal';
import { getLLMConnection, saveLLMConnection, clearLLMConnection } from '../lib/api';
import type { LLMRouting } from '../../shared/routing';
export function LLMSettings({
  language,
  localSupported,
  onRefresh,
  notify,
}: {
  language: 'th' | 'en';
  localSupported?: boolean;
  onRefresh: () => void;
  notify: (message: string) => void;
}) {
  const t = (th: string, en: string) => (language === 'th' ? th : en);
  const [open, setOpen] = useState(false);
  const [route, setRoute] = useState(() => getLLMConnection().route);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="setup-guide">
      <Network size={20} />
      <div>
        <h3>LLM · Fallback · Ollama</h3>
        <p>
          {t(
            'เลือก Local LLM หรือผู้ให้บริการสำรองเมื่อ Gemini ติดโควตา',
            'Choose a local LLM or an independent fallback when Gemini reaches quota.',
          )}
        </p>
        <button
          className="button"
          onClick={() => {
            const saved = getLLMConnection();
            setRoute(saved.route);
            setKey(saved.key);
            setError('');
            setOpen(true);
          }}
        >
          {t('ตั้งค่า LLM และ fallback', 'Configure LLM and fallback')}
        </button>
        {open && (
          <Modal
            title={t('LLM และการสลับสำรอง', 'LLM routing and fallback')}
            onClose={() => {
              setOpen(false);
              setKey('');
            }}
          >
            <form
              className="credential-form"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  saveLLMConnection(route, key);
                  setOpen(false);
                  setKey('');
                  onRefresh();
                  notify(
                    t(
                      'บันทึกเส้นทาง LLM แล้ว ตรวจข้อมูลโมเดลก่อนใช้งาน',
                      'LLM route saved. Check model metadata before use.',
                    ),
                  );
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Unable to save.');
                }
              }}
            >
              <label>
                {t('ผู้ให้บริการ', 'Provider')}
                <select
                  value={route.provider}
                  onChange={(e) => {
                    setRoute({
                      ...route,
                      provider: e.target.value as LLMRouting['provider'],
                      model: '',
                    });
                    setKey('');
                  }}
                >
                  <option value="ollama">Ollama (Local LLM)</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="groq">Groq</option>
                </select>
              </label>
              <label>
                {t('ชื่อโมเดลจากผู้ให้บริการ', 'Provider model ID')}
                <input
                  value={route.model}
                  onChange={(e) => setRoute({ ...route, model: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={
                    route.provider === 'ollama'
                      ? 'model:tag (ollama list)'
                      : 'Exact model ID from provider dashboard'
                  }
                />
              </label>
              {route.provider !== 'ollama' && (
                <label>
                  {t('API key ของผู้ให้บริการนี้', 'This provider’s API key')}
                  <input
                    type="password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              )}
              <label>
                {t('โมเดลหลัก', 'Primary route')}
                <select
                  value={route.primary}
                  onChange={(e) =>
                    setRoute({ ...route, primary: e.target.value as LLMRouting['primary'] })
                  }
                >
                  <option value="gemini">Gemini</option>
                  <option value="external">
                    {route.provider === 'ollama' ? 'Ollama' : route.provider}
                  </option>
                </select>
              </label>
              <label className="credential-option">
                <input
                  type="checkbox"
                  checked={route.fallback}
                  onChange={(e) => setRoute({ ...route, fallback: e.target.checked })}
                />
                {t(
                  'สลับจาก Gemini มาเส้นทางนี้อัตโนมัติเมื่อเรียกไม่สำเร็จ',
                  'Automatically fail over from Gemini to this route',
                )}
              </label>
              <label>
                {t('Gemini model ID (ไม่บังคับ)', 'Gemini model ID (optional)')}
                <input
                  value={route.geminiModel}
                  onChange={(e) => setRoute({ ...route, geminiModel: e.target.value })}
                  autoComplete="off"
                  placeholder={t('เว้นว่างเพื่อใช้ค่าเดิม', 'Leave empty for defaults')}
                />
              </label>
              {route.provider === 'ollama' ? (
                <div className="privacy-box">
                  <p>
                    {t(
                      'ติดตั้งและเปิด Ollama แล้วรันแอปนี้บนเครื่องเดียวกัน ใช้ชื่อโมเดลที่แสดงใน ollama list ไม่ต้องใช้ API key',
                      'Start Ollama and run this app on the same computer. Use an installed model from ollama list; no API key is needed.',
                    )}
                  </p>
                  {localSupported === false && (
                    <p role="alert">
                      {t(
                        'ขณะนี้เป็นเว็บบน Vercel จึงเชื่อม localhost ของคุณไม่ได้ ต้องรันแอปบนเครื่องคุณก่อน',
                        'This Vercel deployment cannot reach your localhost. Run the app locally to use Ollama.',
                      )}
                    </p>
                  )}
                </div>
              ) : (
                <p>
                  {t(
                    'เมื่อใช้เส้นทางนี้ ข้อความและบริบทที่เกี่ยวข้องจะถูกส่งให้ผู้ให้บริการที่เลือก และอาจมีค่าใช้จ่าย ใช้ key ของผู้ให้บริการนั้น ไม่ใช่ Gemini key',
                    'This route sends relevant text and context to the selected provider and may incur charges. Use that provider’s own key, not your Gemini key.',
                  )}
                </p>
              )}
              <p className="micro muted">
                {t(
                  'เก็บการตั้งค่าและ key เฉพาะแท็บนี้ ไม่รวมในไฟล์ส่งออก รองรับข้อความเท่านั้น ไม่รองรับ Google Search เอกสาร และเสียง',
                  'Saved for this tab only and excluded from exports. Text only; Google Search, documents and audio require Gemini.',
                )}
              </p>
              <p className="micro muted">
                {t(
                  'Routing → Draft → Evidence review: สลับได้ไม่เกินหนึ่งครั้งก่อนเริ่มคำตอบ หากเริ่มตอบแล้วจะไม่ผสมคำตอบจากอีกโมเดล',
                  'Routing → Draft → Evidence review: one failover before answer text begins. Partial answers are never mixed across models.',
                )}
              </p>
              {error && <p role="alert">{error}</p>}
              <button
                className="button primary"
                type="submit"
                disabled={route.provider === 'ollama' && localSupported === false}
              >
                {t('บันทึกเส้นทาง', 'Save routing')}
              </button>
              <button
                className="button"
                type="button"
                onClick={() => {
                  clearLLMConnection();
                  setOpen(false);
                  setKey('');
                  onRefresh();
                  notify(t('กลับไปใช้ Gemini แล้ว', 'Restored Gemini routing.'));
                }}
              >
                {t('ล้างเส้นทางและกลับไปใช้ Gemini', 'Reset to Gemini')}
              </button>
            </form>
          </Modal>
        )}
      </div>
    </div>
  );
}
