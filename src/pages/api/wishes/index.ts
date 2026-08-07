import type { APIRoute } from 'astro';
import { moderate } from '../../../lib/ai';
const demo = [
 { id: 'starlit-start', content: 'May I give myself permission to begin again, slowly and without apology.', theme: 'new beginning', locale: 'en', supportCount: 128, createdAt: '2026-08-06T20:00:00Z' },
 { id: 'kind-future', content: '愿我所爱的人平安健康，也愿我有勇气走向想去的地方。', theme: 'gentle courage', locale: 'zh-CN', supportCount: 92, createdAt: '2026-08-05T20:00:00Z' },
 { id: 'quiet-light', content: 'I hope the ordinary days ahead feel full of light.', theme: 'quiet joy', locale: 'en', supportCount: 71, createdAt: '2026-08-04T20:00:00Z' },
];
export const GET: APIRoute = ({ url }) => { const sort = url.searchParams.get('sort'); const wishes = sort === 'popular' ? [...demo].sort((a,b) => b.supportCount - a.supportCount) : demo; return Response.json({ wishes }); };
export const POST: APIRoute = async ({ request }) => { const input = await request.json(); const review = moderate(input.content ?? ''); if (review.verdict === 'blocked') return Response.json({ status: 'blocked', message: review.reason }, { status: 422 }); return Response.json({ id: crypto.randomUUID(), status: 'published', message: 'Your wish is now on the wall.' }); };
