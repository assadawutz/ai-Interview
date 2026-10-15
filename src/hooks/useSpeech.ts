import { useRef, useState, useEffect } from 'react';
import { request } from '../lib/api';
export function useSpeech(language: 'th' | 'en', notify: (text: string) => void) {
  const [playing, setPlaying] = useState(false);
  const current = useRef<{
    audio?: HTMLAudioElement;
    controller: AbortController;
    url?: string;
  } | null>(null);
  const stop = () => {
    current.current?.controller.abort();
    current.current?.audio?.pause();
    if (current.current?.url) URL.revokeObjectURL(current.current.url);
    current.current = null;
    window.speechSynthesis?.cancel();
    setPlaying(false);
  };
  const speak = async (text: string) => {
    stop();
    if (!text.trim()) return;
    const token = { controller: new AbortController() } as NonNullable<typeof current.current>;
    current.current = token;
    setPlaying(true);
    try {
      const response = await request<{ audio: string; mimeType: string }>(
        'tts',
        { text: text.slice(0, 5000), language },
        token.controller.signal,
      );
      if (current.current !== token) return;
      const bytes = Uint8Array.from(atob(response.audio), (ch) => ch.charCodeAt(0));
      token.url = URL.createObjectURL(new Blob([bytes], { type: response.mimeType }));
      token.audio = new Audio(token.url);
      token.audio.onended = () => {
        if (current.current === token) stop();
      };
      token.audio.onerror = () => {
        if (current.current === token) {
          stop();
          notify('Audio playback failed.');
        }
      };
      await token.audio.play();
    } catch (error) {
      if (current.current !== token || token.controller.signal.aborted) return;
      if ('speechSynthesis' in window) {
        notify('AI audio unavailable; using browser speech.');
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language === 'th' ? 'th-TH' : 'en-US';
        utterance.onend = () => {
          if (current.current === token) stop();
        };
        utterance.onerror = () => {
          if (current.current === token) {
            stop();
            notify('Browser speech is unavailable.');
          }
        };
        window.speechSynthesis.speak(utterance);
      } else {
        stop();
        notify(error instanceof Error ? error.message : 'Speech is unavailable.');
      }
    }
  };
  useEffect(() => stop, []);
  return { speak, stop, playing };
}
