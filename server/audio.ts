/** Gemini may return raw mono signed 16-bit PCM rather than a WAV container. */
export function audioToWav(data: string, mimeType: string): { audio: string; mimeType: string } {
  if (/^audio\/(wav|x-wav|wave)(;|$)/i.test(mimeType))
    return { audio: data, mimeType: 'audio/wav' };
  if (!/^audio\/(L16|pcm)(;|$)/i.test(mimeType))
    throw new Error('Unsupported audio format from speech provider.');
  const rate = Number(mimeType.match(/rate=(\d+)/i)?.[1] || 24000);
  if (rate < 8000 || rate > 96000) throw new Error('Invalid audio sample rate.');
  const pcm = Buffer.from(data, 'base64');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return { audio: Buffer.concat([header, pcm]).toString('base64'), mimeType: 'audio/wav' };
}
