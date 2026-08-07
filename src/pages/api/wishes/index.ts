import type { APIRoute } from 'astro';
import { env as workerEnv } from 'cloudflare:workers';
import { moderate, translateWish, type AiEnv } from '../../../lib/ai';
import { isLocale, type Locale } from '../../../lib/i18n';

type D1Statement = { bind: (...values: unknown[]) => D1Statement; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<unknown> };
type D1Like = { prepare: (query: string) => D1Statement };
type Wish = { id: string; content: string; locale: Locale; theme: string; supportCount: number; createdAt: string };
const demo: Wish[] = [
  { id: 'starlit-start', content: 'May I give myself permission to begin again, slowly and without apology.', theme: 'new-beginning', locale: 'en', supportCount: 128, createdAt: '2026-08-06T20:00:00Z' },
  { id: 'kind-future', content: '愿我所爱的人平安健康，也愿我有勇气走向想去的地方。', theme: 'gentle-courage', locale: 'zh-CN', supportCount: 92, createdAt: '2026-08-05T20:00:00Z' },
  { id: 'quiet-light', content: 'I hope the ordinary days ahead feel full of light.', theme: 'quiet-joy', locale: 'en', supportCount: 71, createdAt: '2026-08-04T20:00:00Z' },
];
type WishRow = { id: string; content: string; locale: string; theme: string | null; supportCount: number; createdAt: string };
async function publishedWishes(db: D1Like | undefined) {
  if (!db) return [] as Wish[];
  try {
    const rows = await db.prepare(`SELECT wishes.id, creations.content, creations.locale, wishes.theme, wishes.support_count AS supportCount, COALESCE(wishes.published_at, creations.created_at) AS createdAt FROM wishes JOIN creations ON creations.id = wishes.creation_id WHERE wishes.status = 'published' ORDER BY wishes.published_at DESC LIMIT 24`).all<WishRow>();
    return rows.results.filter((row) => isLocale(row.locale)).map((row) => ({ id: row.id, content: row.content, locale: row.locale as Locale, theme: row.theme || 'wish', supportCount: row.supportCount, createdAt: row.createdAt }));
  } catch { return [] as Wish[]; }
}
async function localizedWish(wish: Wish, targetLocale: Locale, db: D1Like | undefined, env: AiEnv) {
  if (wish.locale === targetLocale) return { ...wish, originalContent: wish.content, originalLocale: wish.locale, isTranslated: false };
  type CacheRow = { content: string };
  const cached = db ? await db.prepare('SELECT content FROM wish_translations WHERE wish_id = ? AND target_locale = ?').bind(wish.id, targetLocale).first<CacheRow>() : null;
  if (cached?.content) return { ...wish, content: cached.content, originalContent: wish.content, originalLocale: wish.locale, isTranslated: true };
  try {
    const content = await translateWish(wish.content, wish.locale, targetLocale, env);
    if (db) await db.prepare('INSERT OR IGNORE INTO wish_translations (wish_id, target_locale, content) VALUES (?, ?, ?)').bind(wish.id, targetLocale, content).run();
    return { ...wish, content, originalContent: wish.content, originalLocale: wish.locale, isTranslated: true };
  } catch { return { ...wish, originalContent: wish.content, originalLocale: wish.locale, isTranslated: false }; }
}
export const GET: APIRoute = async ({ url }) => {
  const targetLocale = isLocale(url.searchParams.get('locale') ?? undefined) ? url.searchParams.get('locale') as Locale : 'en';
  const env = workerEnv as unknown as AiEnv & { DB?: D1Like };
  const source = [...(await publishedWishes(env.DB)), ...demo]; const sort = url.searchParams.get('sort'); const wishes = sort === 'popular' ? source.sort((a, b) => b.supportCount - a.supportCount) : source;
  return Response.json({ wishes: await Promise.all(wishes.map((wish) => localizedWish(wish, targetLocale, env.DB, env))) });
};
export const POST: APIRoute = async ({ request }) => {
  const input = await request.json(); const review = moderate(input.content ?? '');
  if (review.verdict === 'blocked') return Response.json({ status: 'blocked', errorCode: 'moderation_blocked' }, { status: 422 });
  const locale = isLocale(input.locale) ? input.locale : 'en'; const id = crypto.randomUUID(); const creationId = crypto.randomUUID();
  const env = workerEnv as unknown as AiEnv & { DB?: D1Like };
  if (env.DB) {
    try {
      await env.DB.prepare('INSERT INTO creations (id, owner_id, owner_type, kind, locale, content, visibility) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(creationId, 'anonymous', 'anonymous', 'wish', locale, input.content, 'published').run();
      await env.DB.prepare('INSERT INTO wishes (id, creation_id, status, theme, published_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)').bind(id, creationId, 'published', typeof input.theme === 'string' ? input.theme : 'wish').run();
    } catch { return Response.json({ errorCode: 'wish_save_failed' }, { status: 503 }); }
  }
  return Response.json({ id, status: 'published' });
};
