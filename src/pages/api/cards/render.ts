import type { APIRoute } from 'astro';
import { env as workerEnv } from 'cloudflare:workers';
import { CardImageProviderError, generateCardImage, type AiEnv, type CardImageInput } from '../../../lib/ai';

type MediaBucket = { put: (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) => Promise<unknown> };
type CardEnv = AiEnv & { MEDIA?: MediaBucket };
const themes = new Set<CardImageInput['theme']>(['meteor', 'petal', 'aurora']);

export const POST: APIRoute = async ({ request }) => {
  const { content = '', template = 'meteor', locale = 'en', kind = 'blessing', occasion = 'birthday' } = await request.json();
  if (typeof content !== 'string' || !content.trim()) return Response.json({ errorCode: 'card_text_required', error: 'Card text is required.' }, { status: 400 });
  if (!themes.has(template) || (kind !== 'blessing' && kind !== 'wish')) return Response.json({ errorCode: 'card_options_invalid', error: 'Card options are invalid.' }, { status: 400 });
  const env = workerEnv as unknown as CardEnv;
  if (!env.MEDIA) return Response.json({ errorCode: 'card_storage_unavailable', error: 'Card storage is unavailable.' }, { status: 503 });
  const id = crypto.randomUUID();
  try {
    const image = await generateCardImage({ kind, occasion: typeof occasion === 'string' ? occasion : 'birthday', theme: template }, env);
    await env.MEDIA.put(`cards/${id}.png`, image.bytes, { httpMetadata: { contentType: image.contentType }, customMetadata: { locale: typeof locale === 'string' ? locale : 'en', template, kind } });
    return Response.json({ id, template, locale, status: 'ready', imageUrl: `/api/cards/${id}`, format: 'png' });
  } catch (error) {
    console.error('Card image generation failed', error instanceof Error ? error.message : 'Unknown error');
    const providerStatus = error instanceof CardImageProviderError ? error.status : undefined;
    return Response.json({ errorCode: providerStatus ? 'card_image_provider_rejected' : 'card_image_generation_failed', providerStatus, error: 'Card image generation failed.' }, { status: 502 });
  }
};
