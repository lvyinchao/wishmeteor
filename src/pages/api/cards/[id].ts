import type { APIRoute } from 'astro';
import { env as workerEnv } from 'cloudflare:workers';

type StoredImage = { body: ReadableStream; httpMetadata?: { contentType?: string } };
type CardEnv = { MEDIA?: { get: (key: string) => Promise<StoredImage | null> } };
const cardId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async ({ params, url }) => {
  if (!params.id || !cardId.test(params.id)) return new Response('Not found.', { status: 404 });
  const media = (workerEnv as unknown as CardEnv).MEDIA;
  const image = media ? await media.get(`cards/${params.id}.png`) : null;
  if (!image) return new Response('Not found.', { status: 404 });
  const disposition = url.searchParams.has('download') ? 'attachment' : 'inline';
  return new Response(image.body, { headers: { 'content-type': image.httpMetadata?.contentType || 'image/png', 'cache-control': 'public, max-age=31536000, immutable', 'content-disposition': `${disposition}; filename="wishmeteor-card-${params.id}.png"` } });
};
