import type { APIRoute } from 'astro';
import { env as workerEnv } from 'cloudflare:workers';
import type { CardImageInput } from '../../../lib/ai';
import type { CardGenerationEnv, CardGenerationJob } from '../../../lib/card-generation';

type CardEnv = CardGenerationEnv & { CARD_GENERATION_QUEUE?: { send: (message: CardGenerationJob) => Promise<void> } };
const themes = new Set<CardImageInput['theme']>(['meteor', 'petal', 'aurora']);

export const POST: APIRoute = async ({ request }) => {
  const { content = '', template = 'meteor', locale = 'en', kind = 'blessing', occasion = 'birthday' } = await request.json();
  if (typeof content !== 'string' || !content.trim()) return Response.json({ errorCode: 'card_text_required', error: 'Card text is required.' }, { status: 400 });
  if (!themes.has(template) || (kind !== 'blessing' && kind !== 'wish')) return Response.json({ errorCode: 'card_options_invalid', error: 'Card options are invalid.' }, { status: 400 });
  const env = workerEnv as unknown as CardEnv;
  if (!env.MEDIA) return Response.json({ errorCode: 'card_storage_unavailable', error: 'Card storage is unavailable.' }, { status: 503 });
  if (!env.CARD_GENERATION_QUEUE) return Response.json({ errorCode: 'card_task_unavailable', error: 'Card task processing is unavailable.' }, { status: 503 });
  const id = crypto.randomUUID();
  const metadata = { locale: typeof locale === 'string' ? locale : 'en', template, kind };
  await env.MEDIA.put(`cards/${id}.json`, JSON.stringify({ status: 'pending' }), { httpMetadata: { contentType: 'application/json' }, customMetadata: metadata });
  try {
    await env.CARD_GENERATION_QUEUE.send({ id, input: { kind, occasion: typeof occasion === 'string' ? occasion : 'birthday', theme: template }, metadata });
  } catch {
    await env.MEDIA.put(`cards/${id}.json`, JSON.stringify({ status: 'failed', errorCode: 'card_task_dispatch_failed' }), { httpMetadata: { contentType: 'application/json' }, customMetadata: metadata });
    return Response.json({ errorCode: 'card_task_dispatch_failed', error: 'Card task processing is unavailable.' }, { status: 503 });
  }
  return Response.json({ id, template, locale, status: 'pending', statusUrl: `/api/cards/${id}?status=1`, imageUrl: `/api/cards/${id}`, format: 'png' }, { status: 202 });
};
