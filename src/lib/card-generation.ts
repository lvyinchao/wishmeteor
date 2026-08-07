import { CardImageProviderError, generateCardImage, type AiEnv, type CardImageInput } from './ai';

export type CardMetadata = { locale: string; template: CardImageInput['theme']; kind: CardImageInput['kind']; quality: CardImageInput['quality'] };
export type CardGenerationJob = { id: string; input: CardImageInput; metadata: CardMetadata; libraryTheme?: CardImageInput['theme'] };

export type CardMediaBucket = {
  put: (key: string, value: ArrayBuffer | string, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) => Promise<unknown>;
};

export type CardGenerationEnv = AiEnv & { MEDIA?: CardMediaBucket };

export function cardBackgroundKey(theme: CardImageInput['theme']) { return `card-backgrounds/v1/${theme}.png`; }

export async function processCardGeneration({ id, input, metadata, libraryTheme }: CardGenerationJob, env: CardGenerationEnv) {
  if (!env.MEDIA) throw new Error('Card storage is unavailable.');
  try {
    const image = await generateCardImage(input, env);
    await env.MEDIA.put(`cards/${id}.png`, image.bytes, { httpMetadata: { contentType: image.contentType }, customMetadata: metadata });
    if (libraryTheme && input.quality === 'fast') await env.MEDIA.put(cardBackgroundKey(libraryTheme), image.bytes, { httpMetadata: { contentType: image.contentType }, customMetadata: metadata });
    await env.MEDIA.put(`cards/${id}.json`, JSON.stringify({ status: 'ready' }), { httpMetadata: { contentType: 'application/json' }, customMetadata: metadata });
  } catch (error) {
    const providerStatus = error instanceof CardImageProviderError ? error.status : undefined;
    console.error('Card image generation failed', error instanceof Error ? error.message : 'Unknown error');
    await env.MEDIA.put(`cards/${id}.json`, JSON.stringify({ status: 'failed', errorCode: providerStatus ? 'card_image_provider_rejected' : 'card_image_generation_failed', providerStatus }), { httpMetadata: { contentType: 'application/json' }, customMetadata: metadata });
  }
}
