import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, LoaderCircle } from 'lucide-react';
import type { CandidateContext } from '../../shared/contracts';
import { request } from '../lib/api';
export function Copilot({
  context,
  question,
  language,
  notify,
}: {
  context: CandidateContext;
  question: string;
  language: 'th' | 'en';
  notify: (text: string) => void;
}) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]),
    [input, setInput] = useState(''),
    [busy, setBusy] = useState(false);
  const token = useRef<AbortController | null>(null);
  const t = (th: string, en: string) => (language === 'th' ? th : en);
  useEffect(() => () => token.current?.abort(), []);
  return (
    <section className="copilot">
      <h3>
        <MessageSquare size={16} />
        {t('ถามโค้ชเพิ่มเติม', 'Ask your coach')}
      </h3>
      <div className="chat-log" aria-live="polite">
        {messages.map((m, i) => (
          <p className={`chat-message ${m.role}`} key={i}>
            <strong>{m.role === 'user' ? t('คุณ', 'You') : 'Coach'}</strong>
            {m.text}
          </p>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!input.trim() || busy) return;
          const controller = new AbortController();
          token.current = controller;
          const next = [...messages, { role: 'user' as const, text: input.trim() }].slice(-19);
          setBusy(true);
          try {
            const result = await request<{ reply: string }>(
              'copilot-chat',
              { context, activeQuestion: question, language, messages: next },
              controller.signal,
            );
            if (token.current === controller) {
              setMessages([...next, { role: 'assistant', text: result.reply }]);
              setInput('');
            }
          } catch (error) {
            if (!controller.signal.aborted)
              notify(error instanceof Error ? error.message : 'Chat failed.');
          } finally {
            if (token.current === controller) {
              token.current = null;
              setBusy(false);
            }
          }
        }}
      >
        <input
          value={input}
          maxLength={10000}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('เช่น ช่วยยกตัวอย่างให้ชัดขึ้น', 'e.g. Help me explain the trade-offs')}
          aria-label={t('คำถามเพิ่มเติม', 'Follow-up question')}
        />
        <button
          className="icon-button"
          disabled={busy || !input.trim()}
          aria-label={t('ส่งคำถาม', 'Send follow-up')}
        >
          {busy ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
        </button>
      </form>
    </section>
  );
}
