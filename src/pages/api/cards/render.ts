import type { APIRoute } from 'astro';
import { env as workerEnv } from 'cloudflare:workers';
import { CardImageProviderError, generateCardImage, type AiEnv, type CardImageInput } from '../../../lib/ai';

type MediaBucket = { put: (key: string, value: ArrayBuffer | string, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) => Promise<unknown> };
type CardEnv = AiEnv & { MEDIA?: MediaBucket };
type ExecutionContextLike = { waitUntil: (promise: Promise<unknown>) => void };
type RuntimeLocals = { runtime?: { ctx?: ExecutionContextLike } };
const themes = new Set<CardImageInput['theme']>(['meteor', 'petal', 'aurora']);

export const POST: APIRoute = async ({ request, locals }) => {
  const { content = '', template = 'meteor', locale = 'en', kind = 'blessing', occasion = 'birthday' } = await request.json();
  if (typeof content !== 'string' || !content.trim()) return Response.json({ errorCode: 'card_text_required', error: 'Card text is required.' }, { status: 400 });
  if (!themes.has(template) || (kind !== 'blessing' && kind !== 'wish')) return Response.json({ errorCode: 'card_options_invalid', error: 'Card options are invalid.' }, { status: 400 });
  const env = workerEnv as unknown as CardEnv;
  if (!env.MEDIA) return Response.json({ errorCode: 'card_storage_unavailable', error: 'Card storage is unavailable.' }, { status: 503 });
  const context = (locals as RuntimeLocals).runtime?.ctx;
  if (!context) return Response.json({ errorCode: 'card_task_unavailable', error: 'Card task processing is unavailable.' }, { status: 503 });
  const id = crypto.randomUUID();
  const metadata = { locale: typeof locale === 'string' ? locale : 'en', template, kind };
  await env.MEDIA.put(`cards/${id}.json`, JSON.stringify({ status: 'pending' }), { httpMetadata: { contentType: 'application/json' }, customMetadata: metadata });
  const task = generateCardImage({ kind, occasion: typeof occasion === 'string' ? occasion : 'birthday', theme: template }, env).then(async (image) => {
    await env.MEDIA!.put(`cards/${id}.png`, image.bytes, { httpMetadata: { contentType: image.contentType }, customMetadata: metadata });
    await env.MEDIA!.put(`cards/${id}.json`, JSON.stringify({ status: 'ready' }), { httpMetadata: { contentType: 'application/json' }, customMetadata: metadata });
  }).catch(async (error) => {
    const providerStatus = error instanceof CardImageProviderError ? error.status : undefined;
    console.error('Card image generation failed', error instanceof Error ? error.message : 'Unknown error');
    await env.MEDIA!.put(`cards/${id}.json`, JSON.stringify({ status: 'failed', errorCode: providerStatus ? 'card_image_provider_rejected' : 'card_image_generation_failed', providerStatus }), { httpMetadata: { contentType: 'application/json' }, customMetadata: metadata });
  });
  context.waitUntil(task);
  return Response.json({ id, template, locale, status: 'pending', statusUrl: `/api/cards/${id}?status=1`, imageUrl: `/api/cards/${id}`, format: 'png' }, { status: 202 });
};
