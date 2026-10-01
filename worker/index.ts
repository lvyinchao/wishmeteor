import { handleAuth } from './auth';
import { outboundRel } from '../src/lib/link-policy';

/**
 * Dynamic endpoints for wish submissions, community stars, and account access.
 * Everything else is a prerendered static asset served through ASSETS.fetch.
 */
export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  EMAIL?: SendEmail;
  GOOGLE_CLIENT_ID?: string;
  APP_ORIGIN?: string;
  ADMIN_API_TOKEN?: string;
}

interface Submission {
  name: string;
  url: string;
  email: string;
  category: string;
  notes: string;
}

const TRUST_HOSTS = new Set(['wishmeteor.net', 'www.wishmeteor.net']);
/** Domains that never get a listing, independent of what the form says. */
const BLOCKED = ['trendylinkz', 'backlinks4u', 'seo-linkz', 'dofollow-directory'];
const HOUR_MS = 3_600_000;
const MAX_PER_HOUR = 5;
const MIN_DESCRIPTION_CHARS = 300;
const DAILY_LAUNCH_CAP = 9;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const CONTENT_FIELDS = ['slug', 'name', 'url', 'category', 'summary', 'description', 'tags', 'pricing', 'status', 'origin', 'sources', 'firstSeenAt', 'lastSeenAt', 'lastVerifiedAt', 'checksFailed', 'approved', 'wish'];

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: JSON_HEADERS });
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) difference |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return difference === 0;
}

function isAdmin(request: Request, env: Env): boolean {
  const configured = env.ADMIN_API_TOKEN;
  if (!configured) return false;
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9._~-]{32,256})$/.exec(header);
  return !!match && constantTimeEqual(match[1], configured);
}

function validateManagedTool(raw: unknown, slug: string): { value: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: {}, errors: ['body must be a JSON object'] };
  const input = raw as Record<string, unknown>;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const summary = typeof input.summary === 'string' ? input.summary.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const category = typeof input.category === 'string' ? input.category.trim() : '';
  let url: URL | null = null;
  try { url = new URL(typeof input.url === 'string' ? input.url : ''); } catch { /* reported below */ }
  if (!name || name.length > 80) errors.push('name must be 1-80 characters');
  if (summary.length < 40 || summary.length > 160) errors.push('summary must be 40-160 characters');
  if (description.length < MIN_DESCRIPTION_CHARS || description.length > 12000) errors.push(`description must be ${MIN_DESCRIPTION_CHARS}-12000 characters`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category)) errors.push('category must be a lowercase category slug');
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) errors.push('url must be a valid http(s) URL');
  if (!Array.isArray(input.tags) || input.tags.length < 1 || input.tags.length > 12 || input.tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 40)) errors.push('tags must contain 1-12 strings of at most 40 characters');
  if (!['free', 'freemium', 'paid', 'open-source'].includes(String(input.pricing))) errors.push('pricing must be free, freemium, paid, or open-source');
  if (!['active', 'beta', 'stale', 'archived'].includes(String(input.status))) errors.push('status must be active, beta, stale, or archived');
  if (input.origin !== undefined && !['curated', 'submitted'].includes(String(input.origin))) errors.push('origin must be curated or submitted');
  if (Array.isArray(input.sources) && input.sources.length > 10) errors.push('sources may contain at most 10 items');
  const value: Record<string, unknown> = {};
  for (const key of CONTENT_FIELDS) if (key in input && key !== 'slug' && key !== 'approved') value[key] = input[key];
  Object.assign(value, {
    slug,
    name,
    url: url?.toString().replace(/\/$/, '') ?? '',
    category,
    summary,
    description,
    tags: Array.isArray(input.tags) ? input.tags.map((tag) => String(tag).trim()) : [],
    firstSeenAt: typeof input.firstSeenAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.firstSeenAt) ? input.firstSeenAt : new Date().toISOString().slice(0, 10),
    lastSeenAt: new Date().toISOString().slice(0, 10),
    lastVerifiedAt: null,
    checksFailed: 0,
    approved: true,
  });
  return { value, errors };
}

const htmlEscape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function renderToolPage(tool: Record<string, unknown>): Response {
  const title = htmlEscape(tool.name);
  const summary = htmlEscape(tool.summary);
  const description = htmlEscape(tool.description);
  const category = htmlEscape(tool.category);
  const link = htmlEscape(tool.url);
  const tags = Array.isArray(tool.tags) ? tool.tags.map((tag) => `<span class="tag">${htmlEscape(tag)}</span>`).join(' ') : '';
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — WishMeteor</title><meta name="description" content="${summary}"><link rel="canonical" href="https://wishmeteor.net/tool/${htmlEscape(tool.slug)}"><style>body{margin:0;background:#090d18;color:#edf2ff;font:16px/1.7 system-ui,sans-serif}main{max-width:820px;margin:8vh auto;padding:32px}a{color:#91d8ff}.muted{color:#aab5ca}.tag{display:inline-block;background:#172235;border-radius:99px;padding:3px 12px;margin:4px}.card{background:#111a2b;border:1px solid #26334a;border-radius:18px;padding:28px;margin:24px 0}</style></head><body><main><a href="/">WishMeteor</a><p class="muted"><a href="/tools">AI tools</a> / ${category}</p><h1>${title}</h1><p>${summary}</p><div class="card"><p>${description}</p><p>${tags}</p><a href="${link}" rel="nofollow noopener" target="_blank">Visit ${title} ↗</a></div><p class="muted">Managed listing · WishMeteor</p></main></body></html>`;
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

async function managedTools(env: Env): Promise<Record<string, unknown>[]> {
  const rows = await env.DB.prepare('SELECT content_json FROM managed_tools ORDER BY updated_at DESC').all<{ content_json: string }>();
  return (rows.results ?? []).flatMap((row) => { try { return [JSON.parse(row.content_json) as Record<string, unknown>]; } catch { return []; } });
}

async function handleAdmin(request: Request, env: Env, pathname: string): Promise<Response> {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  if (pathname === '/api/admin/submissions' && request.method === 'GET') {
    const result = await env.DB.prepare("SELECT id, name, url, domain, email, category, notes, created_at, verdict FROM submissions WHERE verdict = 'pending' ORDER BY created_at ASC LIMIT 100").all();
    return json({ submissions: result.results ?? [] });
  }
  if (pathname === '/api/admin/content' && request.method === 'GET') return json({ tools: await managedTools(env) });
  const contentMatch = pathname.match(/^\/api\/admin\/content\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  if (contentMatch && request.method === 'PUT') {
    const slug = contentMatch[1];
    const raw = await request.text();
    if (raw.length > 64_000) return json({ error: 'payload-too-large' }, 413);
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return json({ error: 'invalid-json' }, 400); }
    const { value, errors } = validateManagedTool(input, slug);
    if (errors.length) return json({ error: 'invalid-content', details: errors }, 400);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO managed_tools (slug, content_json, created_at, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET content_json = excluded.content_json, updated_at = excluded.updated_at`)
      .bind(slug, JSON.stringify(value), now, now).run();
    return json({ ok: true, tool: value });
  }
  const approvalMatch = pathname.match(/^\/api\/admin\/submissions\/(\d+)\/(approve|reject)$/);
  if (approvalMatch && request.method === 'POST') {
    const id = Number(approvalMatch[1]);
    const action = approvalMatch[2];
    const row = await env.DB.prepare("SELECT id, name, url, category, verdict, created_at FROM submissions WHERE id = ?").bind(id).first<{ id: number; name: string; url: string; category: string; verdict: string; created_at: string }>();
    if (!row) return json({ error: 'submission-not-found' }, 404);
    if (row.verdict !== 'pending') return json({ error: 'submission-not-pending', verdict: row.verdict }, 409);
    if (action === 'reject') {
      await env.DB.prepare("UPDATE submissions SET verdict = 'rejected', verdict_at = ? WHERE id = ? AND verdict = 'pending'").bind(new Date().toISOString(), id).run();
      return json({ ok: true, id, verdict: 'rejected' });
    }
    const today = new Date().toISOString().slice(0, 10);
    const publishedToday = (await managedTools(env)).filter((tool) => {
      const wish = tool.wish as { submittedAt?: string } | undefined;
      return tool.origin === 'submitted' && wish?.submittedAt === today;
    }).length;
    if (publishedToday >= DAILY_LAUNCH_CAP) return json({ error: 'daily-cap-reached', limit: DAILY_LAUNCH_CAP }, 409);
    const raw = await request.text();
    if (raw.length > 64_000) return json({ error: 'payload-too-large' }, 413);
    let body: { slug?: string; content?: unknown };
    try { body = JSON.parse(raw) as { slug?: string; content?: unknown }; } catch { return json({ error: 'invalid-json' }, 400); }
    const slug = body.slug ?? '';
    if (!SLUG_RE.test(slug)) return json({ error: 'invalid-slug' }, 400);
    const { value, errors } = validateManagedTool(body.content, slug);
    if (errors.length) return json({ error: 'invalid-content', details: errors }, 400);
    value.origin = 'submitted';
    const now = new Date().toISOString();
    value.wish = { submittedAt: row.created_at.slice(0, 10), blessingShort: '', blessingLong: '', notifiedAt: null };
    const result = await env.DB.batch([
      env.DB.prepare("UPDATE submissions SET verdict = 'approved', verdict_at = ? WHERE id = ? AND verdict = 'pending'").bind(now, id),
      env.DB.prepare(`INSERT INTO managed_tools (slug, content_json, created_at, updated_at)
        SELECT ?, ?, ?, ? WHERE changes() = 1
        ON CONFLICT(slug) DO UPDATE SET content_json = excluded.content_json, updated_at = excluded.updated_at`)
        .bind(slug, JSON.stringify(value), now, now),
    ]);
    if (!result[0]?.meta.changes) return json({ error: 'submission-not-pending' }, 409);
    return json({ ok: true, id, verdict: 'approved', tool: value });
  }
  return json({ error: 'not-found' }, 404);
}

async function handleManagedPublic(request: Request, env: Env, pathname: string): Promise<Response | null> {
  if (request.method !== 'GET') return null;
  if (pathname === '/') {
    const curated = (await managedTools(env)).filter((tool) => tool.approved === true && tool.status !== 'archived' && tool.origin === 'curated');
    const fresh = curated.slice(0, 12);
    const asset = await env.ASSETS.fetch(request);
    if (!fresh.length) return asset;
    const categoryNames: Record<string, string> = {
      'agents-automation': 'Agents & Automation',
      'ai-chat': 'Chat & Assistants',
      'ai-coding': 'Coding',
      'audio-voice': 'Voice & Music',
      'data-retrieval': 'Search & RAG',
      'evals-observability': 'Evals & Ops',
      'image-video': 'Image & Video',
      productivity: 'Writing & Research',
      uncategorized: 'Uncategorized',
    };
    const previewSlugs = new Set(['ai-mizu', 'ai-memory-sdk', 'ai-media-studio', 'ai-math-solver', 'kitchendesign-io', 'superhumanizer', 'ai-headshot-generator', 'ai-girl-generator', 'ai-garden-design', 'ai-football', 'ai-detector-image-checker', 'wasitaigenerated']);
    const cards = fresh.map((tool) => {
      const slug = String(tool.slug);
      const image = previewSlugs.has(slug)
        ? `<a class="tool-showcase-card__preview" href="/tool/${htmlEscape(slug)}"><img src="/tool-previews/${htmlEscape(slug)}.jpg" alt="Website preview for ${htmlEscape(tool.name)}" loading="lazy" decoding="async"></a>`
        : `<div class="tool-showcase-card__preview tool-showcase-card__preview--fallback" aria-hidden="true"><span>${htmlEscape(String(tool.name).slice(0, 1))}</span></div>`;
      return `<article class="card tool-showcase-card">${image}<div class="tool-showcase-card__content"><h3><a class="card-title" href="/tool/${htmlEscape(slug)}">${htmlEscape(tool.name)}</a></h3><p>${htmlEscape(tool.summary)}</p><div class="card-meta"><span class="pill">${htmlEscape(categoryNames[String(tool.category)] ?? tool.category)}</span><span class="pill">${htmlEscape(tool.pricing)}</span><a class="pill" href="${htmlEscape(tool.url)}" rel="${outboundRel(tool)}" target="_blank">Visit project ↗</a></div></div></article>`;
    }).join('');
    return new HTMLRewriter()
      .on('.recently-section .grid-cards', { element(element) { element.setInnerContent(cards, { html: true }); } })
      .on('.recently-section .text-link', { element(element) { element.setAttribute('href', '/tools'); element.setInnerContent(`Browse all ${curated.length} tools ↗`); } })
      .transform(asset);
  }
  if (pathname === '/api/content') return json({ tools: await managedTools(env) });
  if (pathname === '/tools' || pathname === '/tools/') {
    const tools = await managedTools(env);
    const cards = tools.map((tool) => `<article><h2><a href="/tool/${htmlEscape(tool.slug)}">${htmlEscape(tool.name)}</a></h2><p>${htmlEscape(tool.summary)}</p><p class="muted">${htmlEscape(tool.category)}</p></article>`).join('');
    const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Tools — WishMeteor</title><meta name="description" content="Discover AI tools in the WishMeteor directory."><style>body{margin:0;background:#090d18;color:#edf2ff;font:16px/1.7 system-ui,sans-serif}main{max-width:960px;margin:8vh auto;padding:32px}a{color:#91d8ff}.muted{color:#aab5ca}article{background:#111a2b;border:1px solid #26334a;border-radius:18px;padding:20px;margin:16px 0}</style></head><body><main><a href="/">WishMeteor</a><h1>AI tools</h1>${cards || '<p class="muted">The directory is being prepared. Check back soon.</p>'}</main></body></html>`;
    return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  const match = pathname.match(/^\/tool\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  if (match) {
    const row = await env.DB.prepare('SELECT content_json FROM managed_tools WHERE slug = ?').bind(match[1]).first<{ content_json: string }>();
    if (!row) return null;
    try { return renderToolPage(JSON.parse(row.content_json) as Record<string, unknown>); } catch { return json({ error: 'content-unavailable' }, 503); }
  }
  return null;
}

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`wishmeteor-form:${value}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Same canonicalisation the build uses: https, no www, no tracking params, no trailing slash. */
function canonicalise(raw: string): { url: string; domain: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  parsed.protocol = 'https:';
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|mc_|ref)/i.test(key)) parsed.searchParams.delete(key);
  }
  if (!parsed.searchParams.size) parsed.search = '';
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const out = parsed.toString().replace(/\/$/, '');
  return { url: out, domain: parsed.hostname };
}

const isEmail = (value: string) => /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(value) && value.length <= 254;

async function readSubmission(request: Request): Promise<Submission | 'honeypot' | null> {
  const contentType = request.headers.get('content-type') ?? '';
  let fields: Record<string, string | undefined>;
  if (contentType.includes('application/json')) {
    fields = (await request.json().catch(() => null)) as Record<string, string> | null ?? {};
  } else {
    const form = await request.formData().catch(() => null);
    if (!form) return null;
    fields = Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : undefined]));
  }
  const { name, url, email, category, notes, hp } = fields as Record<string, string | undefined>;
  // Honeypot: a filled hidden field means a bot. Report success, store nothing, so it learns nothing.
  if (hp && hp.trim() !== '') return 'honeypot';
  if (!name?.trim() || name.length > 80) return null;
  if (!email || !isEmail(email)) return null;
  if (fields.own !== 'yes') return null;
  return {
    name: name.trim(),
    url: (url ?? '').trim(),
    email: email.trim().toLowerCase(),
    category: (category ?? '').trim().slice(0, 40),
    notes: (notes ?? '').trim().slice(0, 600),
  };
}

function redirect(request: Request, status: string): Response {
  const target = new URL('/submit', TRUST_HOSTS.has(new URL(request.url).hostname) ? 'https://wishmeteor.net' : new URL(request.url).origin);
  target.searchParams.set('status', status);
  return Response.redirect(target.toString(), 303);
}

async function handleSubmit(request: Request, env: Env): Promise<Response> {
  const submission = await readSubmission(request);
  if (submission === 'honeypot') return redirect(request, 'queued');
  if (!submission) return redirect(request, 'rejected');

  const target = canonicalise(submission.url);
  if (!target) return redirect(request, 'rejected');
  if (TRUST_HOSTS.has(target.domain) || BLOCKED.some((blocked) => target.domain.includes(blocked))) {
    return redirect(request, 'rejected');
  }

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const ipHash = await sha256(ip);

  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM submissions WHERE ip_hash = ? AND created_at > ?'
  )
    .bind(ipHash, new Date(Date.now() - HOUR_MS).toISOString())
    .first<{ count: number }>();
  if ((recent?.count ?? 0) >= MAX_PER_HOUR) return redirect(request, 'throttled');

  const existing = await env.DB.prepare('SELECT id FROM submissions WHERE domain = ?').bind(target.domain).first();
  if (existing) return redirect(request, 'duplicate');

  await env.DB.prepare(
    `INSERT INTO submissions (name, url, domain, email, category, notes, ip_hash, created_at, verdict)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  )
    .bind(submission.name, target.url, target.domain, submission.email, submission.category, submission.notes, ipHash, new Date().toISOString())
    .run();

  return redirect(request, 'queued');
}

async function isPublishedWish(slug: string, request: Request, env: Env): Promise<boolean> {
  if (!SLUG_RE.test(slug)) return false;
  const assetUrl = new URL(`/tool/${slug}`, request.url);
  const response = await env.ASSETS.fetch(new Request(assetUrl, { method: 'HEAD' }));
  return response.ok;
}

async function handleStars(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    const requested = new URL(request.url).searchParams.get('slugs') ?? '';
    const slugs = [...new Set(requested.split(',').filter((slug) => SLUG_RE.test(slug)))].slice(0, 40);
    if (!slugs.length) return Response.json({ counts: {} }, { headers: JSON_HEADERS });
    const published = (await Promise.all(slugs.map(async (slug) => (await isPublishedWish(slug, request, env)) ? slug : null))).filter((slug): slug is string => !!slug);
    if (!published.length) return Response.json({ counts: {} }, { headers: JSON_HEADERS });
    const placeholders = published.map(() => '?').join(',');
    const result = await env.DB.prepare(`SELECT slug, COUNT(*) AS count FROM wish_stars WHERE slug IN (${placeholders}) GROUP BY slug`)
      .bind(...published).all<{ slug: string; count: number }>();
    const counts = Object.fromEntries(published.map((slug) => [slug, 0]));
    for (const row of result.results ?? []) counts[row.slug] = row.count;
    return Response.json({ counts }, { headers: JSON_HEADERS });
  }

  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'method-not-allowed' }), { status: 405, headers: JSON_HEADERS });
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return new Response(JSON.stringify({ error: 'origin-not-allowed' }), { status: 403, headers: JSON_HEADERS });
  }
  const payload = await request.json().catch(() => null) as { slug?: string; voter?: string } | null;
  const slug = payload?.slug ?? '';
  const voter = payload?.voter ?? '';
  if (!SLUG_RE.test(slug) || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(voter)) {
    return new Response(JSON.stringify({ error: 'invalid-star' }), { status: 400, headers: JSON_HEADERS });
  }
  if (!(await isPublishedWish(slug, request, env))) {
    return new Response(JSON.stringify({ error: 'wish-not-found' }), { status: 404, headers: JSON_HEADERS });
  }
  const voterHash = await sha256(`wishmeteor-star:${voter}`);
  const inserted = await env.DB.prepare('INSERT OR IGNORE INTO wish_stars (slug, voter_hash, created_at) VALUES (?, ?, ?)')
    .bind(slug, voterHash, new Date().toISOString()).run();
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM wish_stars WHERE slug = ?').bind(slug).first<{ count: number }>();
  return Response.json({ count: row?.count ?? 0, alreadyLit: !inserted.meta.changes }, { headers: JSON_HEADERS });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/admin/')) {
      try {
        return await handleAdmin(request, env, pathname);
      } catch (error) {
        console.error('admin api request failed', error);
        return json({ error: 'admin-api-unavailable' }, 503);
      }
    }
    if (pathname === '/api/content' || pathname === '/tools' || pathname === '/tools/' || pathname.startsWith('/tool/')) {
      try {
        const response = await handleManagedPublic(request, env, pathname);
        if (response) return response;
      } catch (error) {
        console.error('managed content read failed', error);
        return json({ error: 'content-unavailable' }, 503);
      }
    }
    if (pathname.startsWith('/api/auth/')) {
      try {
        const response = await handleAuth(request, env);
        if (response) return response;
      } catch (error) {
        console.error('auth request failed', error);
        return new Response(JSON.stringify({ error: 'auth-unavailable' }), { status: 503, headers: JSON_HEADERS });
      }
    }
    if (pathname === '/api/submit') {
      if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'method-not-allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });
      try {
        return await handleSubmit(request, env);
      } catch (error) {
        console.error('submit failed', error);
        return new Response(JSON.stringify({ error: 'storage-unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } });
      }
    }
    if (pathname === '/api/stars') {
      try {
        return await handleStars(request, env);
      } catch (error) {
        console.error('stars failed', error);
        return new Response(JSON.stringify({ error: 'storage-unavailable' }), { status: 503, headers: JSON_HEADERS });
      }
    }
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not-found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
