import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Clock, AlertCircle } from 'lucide-react';

interface InterviewTimerProps {
  className?: string;
}

export const InterviewTimer: React.FC<InterviewTimerProps> = ({ className = '' }) => {
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning) {
      interval = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else if (!isRunning && interval) {
      clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const hrs = Math.floor(mins / 60);
    const displayMins = mins % 60;

    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(displayMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(displayMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const isOverTime = seconds >= 45 * 60; // 45+ minutes alert
  const isApproachingTime = seconds >= 30 * 60 && !isOverTime; // 30-45 minutes alert

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-mono font-medium border transition-colors ${
        isOverTime
          ? 'bg-rose-50 border-rose-200 text-rose-700 animate-pulse'
          : isApproachingTime
          ? 'bg-amber-50 border-amber-200 text-amber-700'
          : 'bg-slate-100 border-slate-200 text-slate-700'
      } ${className}`}
      title={
        isOverTime
          ? 'ระยะเวลาการสัมภาษณ์เกิน 45 นาทีแล้ว (ช่วงสรุปบทสัมภาษณ์ ให้ตอบกระชับ)'
          : isApproachingTime
          ? 'ระยะเวลาการสัมภาษณ์เกิน 30 นาทีแล้ว'
          : 'เวลาสัมภาษณ์ต่อเนื่อง (Interview Duration)'
      }
    >
      <Clock className={`w-3.5 h-3.5 ${isOverTime ? 'text-rose-600' : isApproachingTime ? 'text-amber-600' : 'text-slate-500'}`} />
      
      <span className="font-bold tracking-wider">{formatTime(seconds)}</span>

      {isOverTime && (
        <span className="hidden xl:inline text-[10px] px-1 py-0.2 bg-rose-200 text-rose-800 rounded font-bold uppercase">
          Wrap-up
        </span>
      )}

      {/* Mini Controls */}
      <div className="flex items-center gap-0.5 ml-1 border-l border-slate-300/60 pl-1">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className="p-0.5 hover:text-cyan-700 transition"
          title={isRunning ? 'หยุดเวลาชั่วคราว' : 'เริ่มนับเวลาต่อ'}
        >
          {isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
        </button>
        <button
          onClick={() => {
            setIsRunning(false);
            setSeconds(0);
          }}
          className="p-0.5 hover:text-rose-600 transition"
          title="รีเซ็ตเวลา"
        >
          <RotateCcw className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
};
