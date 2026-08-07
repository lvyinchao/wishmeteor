import type { APIRoute } from 'astro';
import { env as workerEnv } from 'cloudflare:workers';
import type { CardImageInput, CardImageQuality } from '../../../lib/ai';
import { cardBackgroundKey, type CardGenerationEnv, type CardGenerationJob } from '../../../lib/card-generation';

type StoredImage = { body: ReadableStream; httpMetadata?: { contentType?: string } };
type CardEnv = CardGenerationEnv & { MEDIA?: NonNullable<CardGenerationEnv['MEDIA']> & { get: (key: string) => Promise<StoredImage | null> }; CARD_GENERATION_QUEUE?: { send: (message: CardGenerationJob) => Promise<void> } };
const themes = new Set<CardImageInput['theme']>(['meteor', 'petal', 'aurora']);
const qualities = new Set<CardImageQuality>(['fast', 'hd']);

export const POST: APIRoute = async ({ request }) => {
  const { content = '', template = 'meteor', locale = 'en', kind = 'blessing', occasion = 'birthday', quality = 'hd' } = await request.json();
  if (typeof content !== 'string' || !content.trim()) return Response.json({ errorCode: 'card_text_required', error: 'Card text is required.' }, { status: 400 });
  if (!themes.has(template) || !qualities.has(quality) || (kind !== 'blessing' && kind !== 'wish')) return Response.json({ errorCode: 'card_options_invalid', error: 'Card options are invalid.' }, { status: 400 });
  const env = workerEnv as unknown as CardEnv;
  if (!env.MEDIA) return Response.json({ errorCode: 'card_storage_unavailable', error: 'Card storage is unavailable.' }, { status: 503 });
  if (!env.CARD_GENERATION_QUEUE) return Response.json({ errorCode: 'card_task_unavailable', error: 'Card task processing is unavailable.' }, { status: 503 });
  if (quality === 'fast' && await env.MEDIA.get(cardBackgroundKey(template))) return Response.json({ template, locale, quality, status: 'ready', source: 'library', imageUrl: `/api/cards/backgrounds/${template}`, format: 'png' });
  const id = crypto.randomUUID();
  const metadata = { locale: typeof locale === 'string' ? locale : 'en', template, kind, quality };
  await env.MEDIA.put(`cards/${id}.json`, JSON.stringify({ status: 'pending' }), { httpMetadata: { contentType: 'application/json' }, customMetadata: metadata });
  try {
    await env.CARD_GENERATION_QUEUE.send({ id, input: { kind, occasion: typeof occasion === 'string' ? occasion : 'birthday', theme: template, quality }, metadata, libraryTheme: quality === 'fast' ? template : undefined });
  } catch {
    await env.MEDIA.put(`cards/${id}.json`, JSON.stringify({ status: 'failed', errorCode: 'card_task_dispatch_failed' }), { httpMetadata: { contentType: 'application/json' }, customMetadata: metadata });
    return Response.json({ errorCode: 'card_task_dispatch_failed', error: 'Card task processing is unavailable.' }, { status: 503 });
  }
  return Response.json({ id, template, locale, quality, status: 'pending', statusUrl: `/api/cards/${id}?status=1`, imageUrl: `/api/cards/${id}`, format: 'png' }, { status: 202 });
};
