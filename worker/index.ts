/**
 * The only dynamic code on this site: the wish submission endpoint.
 * Everything else is a prerendered static asset served through ASSETS.fetch.
 */
export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/submit') {
      if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'method-not-allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });
      try {
        return await handleSubmit(request, env);
      } catch (error) {
        console.error('submit failed', error);
        return new Response(JSON.stringify({ error: 'storage-unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } });
      }
    }
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not-found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
