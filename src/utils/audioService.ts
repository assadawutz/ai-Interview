import { fileBase64, request } from '../lib/api';
export type AudioOptions = {
  source: 'microphone' | 'tab';
  allowServerTranscription?: boolean;
  deviceId: string;
  language: 'th' | 'en';
  onTranscript: (text: string, final: boolean) => void;
  onLevel: (level: number) => void;
  onStatus: (status: string) => void;
  onError: (message: string) => void;
  onStop: () => void;
};
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;
export class AudioService {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private recognition: Recognition | null = null;
  private recorder: MediaRecorder | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private frame = 0;
  private generation = 0;
  private pending = 0;
  private pipeline: Promise<void> = Promise.resolve();
  private controller: AbortController | null = null;
  private active = false;
  private lastSound = 0;
  private options: AudioOptions | null = null;

  get isListening() {
    return this.active;
  }

  async start(options: AudioOptions) {
    this.stop();
    const generation = ++this.generation;
    this.options = options;
    try {
      const browser = window as unknown as {
        SpeechRecognition?: RecognitionConstructor;
        webkitSpeechRecognition?: RecognitionConstructor;
      };
      const Native = browser.SpeechRecognition || browser.webkitSpeechRecognition;
      if (
        options.allowServerTranscription === false &&
        !(options.source === 'microphone' && !options.deviceId && Native)
      )
        throw new Error(
          'This route supports browser speech only. Use Chrome or Edge with the default microphone, or connect Gemini for recorded audio.',
        );
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Audio capture requires HTTPS or localhost and a supported browser.');
      const stream =
        options.source === 'tab'
          ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          : await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      if (!stream.getAudioTracks().length)
        throw new Error(
          'No shared audio found. Select a browser tab and enable “Share tab audio”.',
        );
      this.active = true;
      this.controller = new AbortController();
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (this.active) {
            this.stop();
            options.onStatus('Audio sharing stopped.');
          }
        };
      });
      this.context = new AudioContext();
      await this.context.resume();
      if (generation !== this.generation) return;
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 256;
      this.context
        .createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
        .connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      let lastLevelUpdate = 0;
      const tick = () => {
        if (!this.active || generation !== this.generation) return;
        analyser.getByteTimeDomainData(values);
        const rms = Math.sqrt(
          values.reduce((sum, n) => sum + ((n - 128) / 128) ** 2, 0) / values.length,
        );
        if (rms > 0.008) this.lastSound = Date.now();
        if (performance.now() - lastLevelUpdate >= 100) {
          options.onLevel(Math.min(1, rms * 6));
          lastLevelUpdate = performance.now();
        }
        this.frame = requestAnimationFrame(tick);
      };
      tick();
      // Browser speech recognition cannot select a microphone; use captured audio for explicit devices.
      if (options.source === 'microphone' && !options.deviceId && Native)
        this.startNative(Native, generation);
      else {
        options.onStatus('Audio transcription · independent ~5 second segments sent to Gemini');
        this.startRecorder(generation);
      }
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      const name = error instanceof Error ? error.name : '';
      options.onError(
        name === 'NotAllowedError'
          ? 'Audio permission was denied. Allow microphone access, or type your question.'
          : error instanceof Error
            ? error.message
            : 'Unable to start audio.',
      );
    }
  }
  private startNative(Native: RecognitionConstructor, generation: number) {
    const options = this.options!;
    const recognition = new Native();
    this.recognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = options.language === 'th' ? 'th-TH' : 'en-US';
    let failures = 0;
    recognition.onresult = (event) => {
      if (generation !== this.generation) return;
      failures = 0;
      let final = '',
        interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript || '';
        if (result.isFinal) final += `${text} `;
        else interim += text;
      }
      if (final.trim()) options.onTranscript(final.trim(), true);
      if (interim.trim()) options.onTranscript(interim.trim(), false);
    };
    recognition.onerror = (event) => {
      if (!this.active || generation !== this.generation) return;
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error)) {
        this.stop();
        options.onError(
          'Speech recognition is unavailable. Choose a microphone device to use server transcription, or type a question.',
        );
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        failures++;
        if (failures >= 3) {
          recognition.onend = null;
          recognition.abort();
          this.recognition = null;
          options.onStatus('Browser speech unavailable; switching to Gemini audio transcription.');
          if (options.allowServerTranscription === false) {
            this.stop();
            options.onError(
              'Browser speech is unavailable. Restart listening or type your question.',
            );
          } else this.startRecorder(generation);
        }
      }
    };
    recognition.onend = () => {
      if (this.active && generation === this.generation)
        this.timer = setTimeout(
          () => {
            try {
              recognition.start();
            } catch {
              this.stop();
              options.onError('Speech recognition stopped. Start listening again.');
            }
          },
          Math.min(500 * 2 ** failures, 5000),
        );
    };
    recognition.start();
    options.onStatus('Live transcription · browser speech service');
  }
  private startRecorder(generation: number) {
    const options = this.options!;
    if (!window.MediaRecorder) {
      this.stop();
      options.onError(
        'Recording is unsupported in this browser. Use Chrome or Edge, or type a question.',
      );
      return;
    }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    if (!mime) {
      this.stop();
      options.onError('No supported audio recording format.');
      return;
    }
    const cycle = () => {
      if (!this.active || generation !== this.generation || !this.stream) return;
      const recorder = new MediaRecorder(new MediaStream(this.stream.getAudioTracks()), {
        mimeType: mime,
      });
      this.recorder = recorder;
      const chunks: Blob[] = [];
      const started = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        this.stop();
        options.onError('Audio recording failed. Please restart listening.');
      };
      recorder.onstop = () => {
        if (!this.active || generation !== this.generation) return;
        const blob = new Blob(chunks, { type: mime });
        if (blob.size > 0 && this.lastSound >= started) {
          if (this.pending < 2) {
            this.pending++;
            const signal = this.controller!.signal;
            this.pipeline = this.pipeline
              .then(async () => {
                if (generation !== this.generation) return;
                const data = await fileBase64(blob);
                const response = await request<{ transcript: string }>(
                  'transcribe',
                  { data, mimeType: mime.split(';')[0], language: options.language },
                  signal,
                );
                if (generation === this.generation && response.transcript)
                  options.onTranscript(response.transcript, true);
              })
              .catch((error) => {
                if (generation === this.generation && !signal.aborted)
                  options.onError(
                    error instanceof Error ? error.message : 'Audio transcription failed.',
                  );
              })
              .finally(() => {
                if (generation === this.generation) this.pending--;
              });
          } else
            options.onStatus(
              'Transcription is catching up; a segment was skipped. Pause speaking or type the missed question.',
            );
        }
        cycle();
      };
      recorder.start();
      this.timer = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 5000);
    };
    cycle();
  }
  stop() {
    this.generation++;
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    cancelAnimationFrame(this.frame);
    this.controller?.abort();
    this.controller = null;
    if (this.recognition) {
      this.recognition.onend = null;
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.abort();
      this.recognition = null;
    }
    if (this.recorder) {
      this.recorder.onstop = null;
      if (this.recorder.state !== 'inactive') this.recorder.stop();
      this.recorder = null;
    }
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = null;
    void this.context?.close().catch(() => {});
    this.context = null;
    this.pending = 0;
    this.pipeline = Promise.resolve();
    this.options?.onLevel(0);
    this.options?.onStop();
    this.options = null;
  }
}
