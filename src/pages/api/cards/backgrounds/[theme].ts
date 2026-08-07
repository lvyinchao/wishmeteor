import type { APIRoute } from 'astro';
import { env as workerEnv } from 'cloudflare:workers';
import { cardBackgroundKey } from '../../../../lib/card-generation';

type StoredImage = { body: ReadableStream; httpMetadata?: { contentType?: string } };
type CardEnv = { MEDIA?: { get: (key: string) => Promise<StoredImage | null> } };
const themes = new Set(['meteor', 'petal', 'aurora']);

export const GET: APIRoute = async ({ params }) => {
  if (!params.theme || !themes.has(params.theme)) return new Response('Not found.', { status: 404 });
  const media = (workerEnv as unknown as CardEnv).MEDIA;
  const image = media ? await media.get(cardBackgroundKey(params.theme as 'meteor' | 'petal' | 'aurora')) : null;
  if (!image) return new Response('Not found.', { status: 404 });
  return new Response(image.body, { headers: { 'content-type': image.httpMetadata?.contentType || 'image/png', 'cache-control': 'public, max-age=3600', 'content-disposition': `inline; filename="wishmeteor-${params.theme}-background.png"` } });
};
