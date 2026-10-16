export type Capabilities = {
  text: boolean;
  transcription: boolean;
  documents: boolean;
  search: boolean;
  tts: boolean;
  browserSpeech: boolean;
  freeOnly: boolean;
};
export function resolveCapabilities(input: {
  native: boolean;
  external: boolean;
  primary: 'gemini' | 'external';
  fallback: boolean;
  freeOnly: boolean;
  catalogReady: boolean;
}): Capabilities {
  const text = input.freeOnly
    ? input.external && input.catalogReady
    : input.primary === 'external'
      ? input.external
      : input.native || (input.fallback && input.external);
  const media = input.native && !input.freeOnly && text;
  return {
    text,
    transcription: media,
    documents: media,
    search: media,
    tts: media,
    browserSpeech: true,
    freeOnly: input.freeOnly,
  };
}
