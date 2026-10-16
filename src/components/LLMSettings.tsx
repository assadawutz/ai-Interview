import { useState, useRef, useEffect } from 'react';
import { Network } from 'lucide-react';
import { Modal } from './Modal';
import {
  getLLMConnection,
  saveLLMConnection,
  clearLLMConnection,
  request,
  remembersLLMConnection,
  storedProviderKey,
} from '../lib/api';
import { freeAgentRouting, type LLMRouting } from '../../shared/routing';
import { agentDefaults } from '../../shared/agents';
import { normalizeGeminiKey } from '../../shared/credentials';
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
  const [remember, setRemember] = useState(remembersLLMConnection);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const lookup = useRef<AbortController | null>(null);
  useEffect(() => () => lookup.current?.abort(), []);
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
            setRemember(remembersLLMConnection());
            setRoute(saved.route.model ? saved.route : freeAgentRouting);
            setModels([]);
            setKey(saved.route.model ? saved.key : '');
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
              lookup.current?.abort();
              setLoading(false);
              setOpen(false);
              setKey('');
            }}
          >
            <form
              className="credential-form"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  saveLLMConnection(route, key, remember);
                  lookup.current?.abort();
                  setLoading(false);
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
              <button
                className="button primary"
                type="button"
                onClick={() => {
                  lookup.current?.abort();
                  setLoading(false);
                  if (route.provider !== 'openrouter') setKey(storedProviderKey('openrouter'));
                  setRoute(freeAgentRouting);
                  setModels([]);
                  setError('');
                }}
              >
                {t(
                  'ใช้ฟรี + Agents อัตโนมัติ (แนะนำ)',
                  'Free models + automatic agents (recommended)',
                )}
              </button>
              {route.agentMode && (
                <div className="privacy-box">
                  <strong>
                    {t(
                      'Agent ประสานงาน: จับคำถาม → เลือกผู้เชี่ยวชาญ → ร่าง → ตรวจหลักฐาน',
                      'Coordinator: detect → specialize → draft → evidence review',
                    )}
                  </strong>
                  {Object.entries(agentDefaults).map(([role, model]) => (
                    <p key={role}>
                      <strong>{role}</strong>: {model}
                    </p>
                  ))}
                  <p>
                    {t(
                      'ตรวจราคาศูนย์จากแคตตาล็อกก่อนใช้ ไม่เลือกโมเดลเสียเงิน ถ้าโควตารายวันของทั้งบัญชีหมดจะหยุดและแจ้ง ไม่มีการรับประกันคำขอฟรีไม่จำกัด',
                      'Checks zero text-token prices before use. No paid fallback. Account-wide daily quota exhaustion stops the request; free usage is not unlimited.',
                    )}
                  </p>
                  <a
                    href="https://openrouter.ai/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    OpenRouter API key
                  </a>
                </div>
              )}
              <label className="credential-option">
                <input
                  type="checkbox"
                  checked={route.agentMode}
                  onChange={(e) => {
                    lookup.current?.abort();
                    setLoading(false);
                    setModels([]);
                    setError('');
                    if (e.target.checked) {
                      if (route.provider !== 'openrouter') setKey(storedProviderKey('openrouter'));
                      setRoute(freeAgentRouting);
                    } else setRoute({ ...route, agentMode: false, freeOnly: false });
                  }}
                />
                {t('Agent อัตโนมัติ + ใช้เฉพาะโมเดลฟรี', 'Automatic agents + free-only models')}
              </label>
              <label>
                {t('ผู้ให้บริการ', 'Provider')}
                <select
                  aria-label={t('ผู้ให้บริการ', 'Provider')}
                  value={route.provider}
                  onChange={(e) => {
                    lookup.current?.abort();
                    setLoading(false);
                    setModels([]);
                    setError('');
                    setRoute({
                      ...route,
                      provider: e.target.value as LLMRouting['provider'],
                      freeOnly: false,
                      agentMode: false,
                      model: '',
                      primary: e.target.value === 'ollama-cloud' ? 'external' : route.primary,
                    });
                    setKey(storedProviderKey(e.target.value as LLMRouting['provider']));
                  }}
                >
                  <option value="ollama-cloud">Ollama Cloud (Vercel)</option>
                  <option value="ollama">Ollama (Local LLM)</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="groq">Groq</option>
                </select>
              </label>
              <label>
                {t('ชื่อโมเดลจากผู้ให้บริการ', 'Provider model ID')}
                <input
                  value={route.model}
                  disabled={route.agentMode}
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
              {route.provider === 'ollama-cloud' && (
                <p className="micro muted">
                  {t(
                    'ใช้ Ollama ผ่าน API บน Vercel ได้ ไม่ต้องเปิดเครื่องหรือเซิร์ฟเวอร์ local แต่ต้องมี key และสิทธิ์ของบัญชี Ollama Cloud',
                    'Uses Ollama’s cloud API from Vercel without a local server. An Ollama Cloud key and account access are required.',
                  )}{' '}
                  <a
                    href="https://ollama.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('สร้าง Ollama key', 'Get an Ollama key')}
                  </a>
                </p>
              )}
              <button
                className="button"
                type="button"
                disabled={loading || (route.provider === 'ollama' && localSupported === false)}
                onClick={async () => {
                  lookup.current?.abort();
                  const controller = new AbortController();
                  lookup.current = controller;
                  setLoading(true);
                  setError('');
                  try {
                    const result = await request<{ models: string[] }>(
                      'llm-models',
                      {},
                      controller.signal,
                      {
                        'X-LLM-Config': JSON.stringify(route),
                        'X-LLM-API-Key': route.provider === 'ollama' ? '' : normalizeGeminiKey(key),
                      },
                    );
                    if (lookup.current === controller && !controller.signal.aborted) {
                      setModels(result.models);
                      if (!result.models.length)
                        setError(
                          t(
                            'ยังไม่มีโมเดลจากผู้ให้บริการนี้',
                            'No models returned by this provider.',
                          ),
                        );
                    }
                  } catch (e) {
                    if (!controller.signal.aborted)
                      setError(e instanceof Error ? e.message : 'Model lookup failed.');
                  } finally {
                    if (lookup.current === controller) setLoading(false);
                  }
                }}
              >
                {loading
                  ? t('กำลังโหลดโมเดล…', 'Loading models…')
                  : t('โหลดรายชื่อโมเดล', 'Load model list')}
              </button>
              {models.length > 0 && (
                <label>
                  {t('เลือกโมเดลที่มีให้บริการ', 'Choose an available model')}
                  <select
                    disabled={route.agentMode}
                    value={models.includes(route.model) ? route.model : ''}
                    onChange={(e) => setRoute({ ...route, model: e.target.value })}
                  >
                    <option value="">{t('เลือกโมเดล', 'Select a model')}</option>
                    {models.map((model) => (
                      <option value={model} key={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="micro muted">
                {t(
                  'รายชื่อโมเดลไม่ยืนยันว่า key ใช้งานได้หรือมีโควตา การสร้างคำตอบอาจมีค่าใช้จ่ายตามบัญชี',
                  'The model list does not verify your key or quota. Generation may incur account charges.',
                )}
              </p>
              <label>
                {t('โมเดลหลัก', 'Primary route')}
                <select
                  disabled={route.agentMode}
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
                  route.agentMode
                    ? 'สลับไปโมเดลฟรีสำรองเมื่อโมเดลหลักไม่พร้อม'
                    : 'สลับจาก Gemini มาเส้นทางนี้อัตโนมัติเมื่อเรียกไม่สำเร็จ',
                  route.agentMode
                    ? 'Use the free backup when a selected agent model is unavailable'
                    : 'Automatically fail over from Gemini to this route',
                )}
              </label>
              <label>
                {t('Gemini model ID (ไม่บังคับ)', 'Gemini model ID (optional)')}
                <input
                  disabled={route.agentMode}
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
                      'เปิด Ollama บนเครื่องนี้ อนุญาต origin ของเว็บด้วย OLLAMA_ORIGINS แล้วเลือกโมเดลจาก ollama list เบราว์เซอร์อาจขอสิทธิ์ Local Network',
                      'Start Ollama on this computer, allow this site origin with OLLAMA_ORIGINS and select an installed model. Your browser may require Local Network permission.',
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
                  'เก็บ key ในเบราว์เซอร์ แยกจากไฟล์ส่งออก ข้อความส่งตรงให้ผู้ให้บริการที่เลือก การเชื่อมตรงขึ้นกับ CORS ของผู้ให้บริการ',
                  'Keys stay in browser storage and out of exports. Requests go directly to the selected provider, subject to its CORS policy.',
                )}
              </p>
              <p className="micro muted">
                {t(
                  'Routing → Draft → Evidence review: สลับได้ไม่เกินหนึ่งครั้งก่อนเริ่มคำตอบ หากเริ่มตอบแล้วจะไม่ผสมคำตอบจากอีกโมเดล',
                  'Routing → Draft → Evidence review: one failover before answer text begins. Partial answers are never mixed across models.',
                )}
              </p>
              <label className="credential-option">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                {t(
                  'จำ key ผู้ให้บริการบนอุปกรณ์นี้ (localStorage)',
                  'Remember provider keys on this device (localStorage)',
                )}
              </label>
              <p className="micro muted">
                {t(
                  'key ใน localStorage ไม่ได้เข้ารหัส สคริปต์ในเว็บและผู้ใช้เครื่องนี้อาจเข้าถึงได้ หลีกเลี่ยงเครื่องสาธารณะ',
                  'localStorage keys are not encrypted and are accessible to this site’s scripts and device users. Avoid shared devices.',
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
                  lookup.current?.abort();
                  setLoading(false);
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
