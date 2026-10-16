import type { GenerateContentParameters, GenerateContentResponse, Model } from '@google/genai';
export interface Provider {
  generate(params: GenerateContentParameters): Promise<GenerateContentResponse>;
  stream(params: GenerateContentParameters): Promise<AsyncGenerator<GenerateContentResponse>>;
  inspect?(model: string, signal: AbortSignal): Promise<Model>;
}
