import type { APIRoute } from 'astro';
import { env as workerEnv } from 'cloudflare:workers';
import { generateWithQwen } from '../../../lib/ai';
import { isLocale } from '../../../lib/i18n';
export const POST: APIRoute = async ({ params, request, cookies }) => {
  const input = await request.json(); const locale = isLocale(input.locale) ? input.locale : 'en';
  const session = cookies.get('wm_session')?.value ?? crypto.randomUUID();
  const payload = { ...input, locale };
  if (params.kind !== 'wish' && params.kind !== 'blessing') return Response.json({ error: 'Unknown generation type.' }, { status: 404 });
  const env = workerEnv as Record<string, string>;
  try {
    const body = await generateWithQwen(payload, params.kind, env);
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'set-cookie': `wm_session=${session}; Path=/; Max-Age=2592000; SameSite=Lax; Secure` } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Generation failed.' }, { status: 502 });
  }
};
