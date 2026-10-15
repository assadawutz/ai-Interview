/**
 * Audio Service for Microphone capture, volume analysis, and Speech Recognition
 */

export class AudioService {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private recognition: any = null;
  private animationId: number | null = null;
  private onVolumeChange: ((volume: number) => void) | null = null;
  private onTranscript: ((text: string, isFinal: boolean) => void) | null = null;

  public isListening: boolean = false;

  constructor() {}

  /**
   * Initializes microphone capture and volume analyser
   */
  async startMicrophone(
    onVolume: (volume: number) => void,
    onSpeechTranscript?: (text: string, isFinal: boolean) => void
  ): Promise<boolean> {
    try {
      this.onVolumeChange = onVolume;
      this.onTranscript = onSpeechTranscript || null;

      // 1. Get User Media
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // 2. Audio Context & Analyser
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      source.connect(this.analyser);

      this.isListening = true;
      this.startVolumeLoop();

      // 3. Web Speech Recognition for Real-time Transcription
      this.setupSpeechRecognition();

      return true;
    } catch (err) {
      console.error('Failed to start microphone:', err);
      this.stop();
      return false;
    }
  }

  private startVolumeLoop() {
    if (!this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkVolume = () => {
      if (!this.analyser || !this.isListening) return;

      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      // Normalize to 0.0 - 1.0 with noise gate threshold
      const normalized = Math.min(1.0, Math.max(0, (average - 10) / 75));

      if (this.onVolumeChange) {
        this.onVolumeChange(normalized);
      }

      this.animationId = requestAnimationFrame(checkVolume);
    };

    checkVolume();
  }

  private setupSpeechRecognition() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Web Speech API is not supported in this browser. Fallback to manual transcription.');
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      // Start with Thai, accepts both Thai & English loanwords seamlessly
      this.recognition.lang = 'th-TH';

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const text = item[0]?.transcript || '';
          if (item.isFinal) {
            finalTranscript += text;
          } else {
            interimTranscript += text;
          }
        }

        if (finalTranscript && this.onTranscript) {
          this.onTranscript(finalTranscript.trim(), true);
        } else if (interimTranscript && this.onTranscript) {
          this.onTranscript(interimTranscript.trim(), false);
        }
      };

      this.recognition.onerror = (e: any) => {
        console.warn('Speech recognition event:', e.error);
        // Automatic restart on transient network/no-speech if still listening
        if (this.isListening && (e.error === 'no-speech' || e.error === 'network')) {
          try {
            this.recognition?.stop();
          } catch (_) {}
        }
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          try {
            this.recognition?.start();
          } catch (_) {}
        }
      };

      this.recognition.start();
    } catch (e) {
      console.warn('Could not initialize speech recognition:', e);
    }
  }

  /**
   * Play base64 WAV audio from Gemini TTS
   */
  async playAudio(base64Wav: string): Promise<void> {
    try {
      const audio = new Audio(`data:audio/wav;base64,${base64Wav}`);
      await audio.play();
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }

  /**
   * Stops microphone and cleans up resources
   */
  stop() {
    this.isListening = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (_) {}
      this.recognition = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch (_) {}
      this.audioCtx = null;
    }
    if (this.onVolumeChange) {
      this.onVolumeChange(0);
    }
  }
}

export const audioService = new AudioService();
