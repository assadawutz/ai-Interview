import { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
const storageKey = 'interview-pulse:motion';
export function MotionControl({ language }: { language: 'th' | 'en' }) {
  const [paused, setPaused] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'paused';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const sync = () => {
      document.documentElement.dataset.motion = paused || document.hidden ? 'paused' : 'active';
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    try {
      localStorage.setItem(storageKey, paused ? 'paused' : 'active');
    } catch {
      /* Motion works without persistence. */
    }
    return () => document.removeEventListener('visibilitychange', sync);
  }, [paused]);
  return (
    <button
      className="icon-button motion-control"
      aria-pressed={paused}
      aria-label={language === 'th' ? 'พักเอฟเฟกต์เคลื่อนไหว' : 'Pause visual effects'}
      title={language === 'th' ? 'เปิด/พัก Motion FX' : 'Toggle Motion FX'}
      onClick={() => setPaused((value) => !value)}
    >
      {paused ? <Play size={16} /> : <Pause size={16} />}
    </button>
  );
}
