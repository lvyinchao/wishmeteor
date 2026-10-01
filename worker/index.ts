import { handleAuth } from './auth';
import { outboundRel } from '../src/lib/link-policy';
import { getDomain } from 'tldts';

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
  makeAWish: string;
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
const CONTENT_FIELDS = ['slug', 'name', 'url', 'category', 'summary', 'description', 'tags', 'pricing', 'status', 'origin', 'sources', 'firstSeenAt', 'lastSeenAt', 'lastVerifiedAt', 'checksFailed', 'approved', 'wish', 'coverImage'];

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
  if (input.coverImage !== undefined && input.coverImage !== `/tool-previews/${slug}.jpg`) errors.push(`coverImage must be /tool-previews/${slug}.jpg`);
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

const DETAIL_POLISH_CSS = `
  .detail-main{padding-block:20px 72px}
  .detail-main .crumbs{margin:16px 0 20px}
  .hero{min-height:470px;grid-template-columns:minmax(0,1.06fr) minmax(340px,.94fr);padding:clamp(32px,5vw,66px);border-color:rgba(221,197,151,.26);background:radial-gradient(34rem 24rem at 82% 13%,rgba(206,164,98,.18),transparent 70%),linear-gradient(125deg,#101b2b 0%,#111a28 56%,#172337 100%)}
  .hero h1{max-width:10ch;font-size:clamp(3.2rem,6.6vw,5.8rem)}
  .hero .eyebrow{display:flex;align-items:center;gap:10px;letter-spacing:.13em}
  .hero .eyebrow::before{content:'✦';display:grid;place-items:center;width:28px;height:28px;border:1px solid rgba(231,191,120,.35);border-radius:50%;color:var(--gold);font-size:.72rem}
  .media{aspect-ratio:1.12;border-radius:22px;border-color:rgba(231,191,120,.3);box-shadow:0 30px 80px rgba(0,0,0,.42),0 0 0 8px rgba(255,255,255,.018)}
  .media--screenshot::after{content:'Official site preview';position:absolute;left:14px;bottom:14px;padding:6px 10px;border:1px solid rgba(255,255,255,.2);border-radius:99px;background:rgba(8,13,22,.78);backdrop-filter:blur(10px);color:#f3f0e8;font-size:.63rem;letter-spacing:.06em}
  .preview-image{object-fit:cover;transition:transform .55s cubic-bezier(.2,.7,.2,1)}
  .media:hover .preview-image{transform:scale(1.035)}
  .hero-actions .button-primary{min-height:50px;padding-inline:21px}
  .rating-note{margin-top:22px;color:#acb6c5}
  .fact-bar{gap:10px;border:0;background:none}
  .fact,.fact:last-child{padding:17px 18px;border:1px solid var(--line);border-radius:14px;background:linear-gradient(145deg,rgba(22,33,49,.9),rgba(14,21,32,.94))}
  .fact-label{font-size:.62rem;letter-spacing:.13em}
  .fact-value{font-size:.92rem}
  .content-grid{gap:clamp(32px,6vw,76px)}
  .story{max-width:72ch;font-size:1.04rem;line-height:1.9}
  .story p:first-child{padding:18px 22px;border-left:2px solid var(--gold);border-radius:0 12px 12px 0;background:linear-gradient(90deg,rgba(231,191,120,.08),rgba(231,191,120,0));font-size:1.1rem}
  .section-label{margin-top:4px}
  .tag-list{margin-top:30px}
  .source-panel{box-shadow:0 20px 54px rgba(0,0,0,.14)}
  .related{margin-top:54px;padding-top:38px}
  @media(max-width:850px){.hero{grid-template-columns:minmax(0,1fr) minmax(270px,.8fr);padding:34px}.hero h1{font-size:clamp(3rem,7vw,4.5rem)}.fact-bar{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:680px){.detail-main{padding-block:10px 48px}.detail-main .crumbs{margin:14px 0 16px}.hero{grid-template-columns:1fr;gap:20px;padding:20px;border-radius:20px}.hero h1{max-width:11ch;font-size:clamp(2.8rem,13vw,4.4rem)}.media{grid-row:1;aspect-ratio:1.42;border-radius:16px}.hero-copy{grid-row:2}.fact-bar{gap:8px;margin:12px 0 30px}.fact,.fact:last-child{padding:13px 14px;border-radius:11px}.content-grid{gap:22px}.story{font-size:.98rem;line-height:1.8}.story p:first-child{padding:14px 16px;font-size:1rem}.related{margin-top:36px;padding-top:28px}}
  @media(max-width:420px){.topbar-inner{gap:10px}.brand{font-size:1.05rem;white-space:nowrap}.nav{gap:8px;font-size:.68rem}.nav-cta{padding:6px 9px;white-space:nowrap}}
  @media(prefers-reduced-motion:reduce){.preview-image{transition:none}}
`;

function renderToolPage(tool: Record<string, unknown>, relatedTools: Record<string, unknown>[] = []): Response {
  const title = htmlEscape(tool.name);
  const summary = htmlEscape(tool.summary);
  const categoryNames: Record<string, string> = {
    'agents-automation': 'Agents & Automation', 'ai-chat': 'Chat & Assistants', 'ai-coding': 'Coding',
    'audio-voice': 'Voice & Music', 'data-retrieval': 'Search & RAG', 'evals-observability': 'Evals & Ops',
    'image-video': 'Image & Video', productivity: 'Writing & Research', 'model-platforms': 'Model Platforms',
    'open-source-models': 'Open-source Models', 'education-learning': 'Education & Learning', 'sports-fitness': 'Sports & Fitness', 'marketing-growth': 'Marketing & Growth', 'business-services': 'Business Services', 'maker-tools': 'Maker Tools', uncategorized: 'New discoveries',
  };
  const categoryId = String(tool.category ?? 'uncategorized');
  const category = htmlEscape(categoryNames[categoryId] ?? categoryId.replace(/-/g, ' '));
  const slug = String(tool.slug ?? '');
  const canonical = `https://wishmeteor.net/tool/${htmlEscape(slug)}`;
  const url = typeof tool.url === 'string' ? tool.url : '';
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* validation prevents this */ }
  const link = htmlEscape(url);
  const coverImage = typeof tool.coverImage === 'string' && tool.coverImage === `/tool-previews/${slug}.jpg` ? tool.coverImage : `/tool-previews/${slug}.jpg`;
  const media = `<img class="preview-image" src="${htmlEscape(coverImage)}" alt="Product cover for ${title}" fetchpriority="high">`;
  const description = typeof tool.description === 'string' ? tool.description : '';
  const paragraphs = description.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const story = paragraphs.map((part) => `<p>${htmlEscape(part).replace(/\n/g, '<br>')}</p>`).join('');
  const tags = Array.isArray(tool.tags) ? tool.tags.slice(0, 12).map((tag) => `<span class="tag">${htmlEscape(tag)}</span>`).join('') : '';
  const sources = Array.isArray(tool.sources) ? tool.sources.slice(0, 10).map((item) => {
    const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    let safeUrl = '';
    try { const parsed = new URL(String(source.url ?? '')); if (parsed.protocol === 'https:' || parsed.protocol === 'http:') safeUrl = parsed.toString(); } catch { /* ignore invalid source */ }
    if (!safeUrl) return '';
    const sourceHost = new URL(safeUrl).hostname.replace(/^www\./, '');
    return `<li><a href="${htmlEscape(safeUrl)}" target="_blank" rel="noopener noreferrer">${htmlEscape(source.type || sourceHost)} <span>↗</span></a><small>${htmlEscape(source.observedAt || '')}</small></li>`;
  }).filter(Boolean).join('') : '';
  const dateText = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? htmlEscape(value.slice(0, 10)) : 'Not yet recorded';
  const status = String(tool.status ?? 'active');
  const statusLabel = status === 'active' ? 'Active' : status === 'beta' ? 'In beta' : status === 'stale' ? 'Needs a fresh check' : 'Archived';
  const statusClass = status === 'active' ? 'is-active' : status === 'beta' ? 'is-beta' : 'is-muted';
  const related = relatedTools.slice(0, 3).map((item) => `<a class="related-card" href="/tool/${htmlEscape(item.slug)}"><span>${category}</span><strong>${htmlEscape(item.name)}</strong><small>${htmlEscape(item.summary)}</small></a>`).join('');
  const shareText = `[${String(tool.name ?? '')} on WishMeteor](${canonical})`;
  const blessing = tool.origin === 'submitted' ? `<div class="wish-note"><span>✦</span><p>A maker in our community brought this project to WishMeteor.</p></div>` : '';
  const makerWishValue = (tool.wish as Record<string, unknown> | undefined)?.makerWish;
  const makerWish = tool.origin === 'submitted' && typeof makerWishValue === 'string' && makerWishValue.trim()
    ? `<div class="wish-note"><span>✧</span><p><strong>The maker’s wish</strong><br>${htmlEscape(makerWishValue)}</p></div>` : '';
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b1220"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><title>${title}: ${summary} — WishMeteor</title><meta name="description" content="${summary}"><link rel="canonical" href="${canonical}"><meta property="og:site_name" content="WishMeteor"><meta property="og:type" content="website"><meta property="og:title" content="${title} — WishMeteor"><meta property="og:description" content="${summary}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="https://wishmeteor.net${htmlEscape(coverImage)}"><meta name="twitter:image" content="https://wishmeteor.net${htmlEscape(coverImage)}"><meta name="twitter:card" content="summary_large_image"><style>
    :root{color-scheme:dark;--bg:#0a101b;--surface:#111a29;--surface-hi:#172337;--text:#f4f1e9;--muted:#a6b0c0;--line:rgba(194,207,227,.14);--gold:#e7bf78;--cyan:#b8d9e7;--serif:Georgia,'Times New Roman',serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(70rem 40rem at 82% -15%,rgba(87,113,146,.19),transparent 62%),var(--bg);color:var(--text);font:16px/1.65 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}a{color:inherit}a:focus-visible{outline:2px solid var(--gold);outline-offset:4px}.shell{width:min(1120px,calc(100% - 48px));margin:auto}.topbar{border-bottom:1px solid var(--line);background:rgba(10,16,27,.82);backdrop-filter:blur(14px)}.topbar-inner{min-height:74px;display:flex;align-items:center;justify-content:space-between;gap:24px}.brand{text-decoration:none;font:500 1.2rem var(--serif);letter-spacing:-.03em}.brand span{color:var(--gold)}.nav{display:flex;gap:24px;align-items:center;color:var(--muted);font-size:.86rem}.nav a{text-decoration:none}.nav a:hover,.crumbs a:hover{color:var(--gold)}.nav-cta{border:1px solid rgba(231,191,120,.4);border-radius:99px;padding:8px 14px;color:var(--text)!important}.crumbs{display:flex;gap:9px;align-items:center;margin:25px 0 17px;color:#8793a6;font-size:.77rem}.crumbs a{text-decoration:none}.crumbs span:last-child{color:#d5dbe4}.hero{position:relative;isolation:isolate;overflow:hidden;display:grid;grid-template-columns:minmax(0,1.12fr) minmax(310px,.88fr);gap:clamp(28px,5vw,68px);align-items:center;min-height:440px;padding:clamp(28px,5vw,58px);border:1px solid rgba(221,197,151,.2);border-radius:24px;background:linear-gradient(112deg,rgba(15,24,39,.98),rgba(14,22,36,.84) 58%,rgba(18,27,41,.72)),radial-gradient(38rem 22rem at 90% 12%,rgba(206,164,98,.12),transparent 70%);box-shadow:0 28px 90px rgba(0,0,0,.17)}.hero-copy{position:relative;z-index:1}.eyebrow{margin:0 0 15px;color:var(--gold);font-size:.67rem;letter-spacing:.17em;text-transform:uppercase}.eyebrow .dot{margin:0 8px;color:#77859a}.hero h1{max-width:12ch;margin:0 0 16px;font:500 clamp(2.7rem,6vw,5rem)/.99 var(--serif);letter-spacing:-.055em;text-wrap:balance}.lede{max-width:49ch;margin:0;color:#c1cad6;font-size:clamp(1rem,1.4vw,1.14rem);line-height:1.75}.hero-actions{display:flex;flex-wrap:wrap;gap:11px;margin-top:27px}.button{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:46px;padding:0 17px;border-radius:999px;text-decoration:none;font-size:.87rem;font-weight:600;transition:transform .2s ease,border-color .2s ease}.button:hover{transform:translateY(-2px)}.button-primary{background:linear-gradient(120deg,#f3d28e,#dda65c);color:#161a22;box-shadow:0 8px 26px rgba(212,162,87,.16)}.button-secondary{border:1px solid rgba(206,216,230,.2);background:rgba(255,255,255,.025);color:#e4e9ef}.rating-note{display:flex;align-items:center;gap:8px;margin:18px 0 0;color:#97a4b7;font-size:.76rem}.rating-note span{color:var(--gold)}.media{position:relative;z-index:1;overflow:hidden;aspect-ratio:1.24;border:1px solid rgba(231,191,120,.24);border-radius:18px;background:#111a29;box-shadow:0 20px 60px rgba(0,0,0,.32)}.preview-image{display:block;width:100%;height:100%;object-fit:cover}.preview-art{position:relative;display:grid;place-items:center;width:100%;height:100%;overflow:hidden;background:radial-gradient(ellipse at 72% 27%,rgba(211,170,105,.23),transparent 35%),radial-gradient(ellipse at 24% 85%,rgba(83,123,166,.25),transparent 48%),linear-gradient(145deg,#17273a,#101927 58%,#292a2c)}.preview-art strong{position:relative;z-index:2;display:grid;place-items:center;width:112px;aspect-ratio:1;border:1px solid rgba(232,206,157,.48);border-radius:50%;background:rgba(20,29,42,.6);box-shadow:0 0 74px rgba(225,185,113,.16);color:#f3d99d;font:500 3.4rem var(--serif)}.preview-art small{position:absolute;bottom:18px;left:18px;color:rgba(237,218,179,.78);font-size:.56rem;letter-spacing:.16em}.orbit{position:absolute;width:82%;aspect-ratio:1;border:1px solid rgba(225,202,162,.15);border-radius:50%}.orbit-a{transform:rotate(-25deg) scaleY(.42)}.orbit-b{transform:rotate(27deg) scaleY(.58)}.art-star{position:absolute;color:#f5d998;text-shadow:0 0 18px rgba(244,202,121,.6)}.art-star-a{top:17%;right:19%}.art-star-b{left:17%;bottom:28%;font-size:1.25rem}.fact-bar{display:grid;grid-template-columns:repeat(4,1fr);margin:17px 0 48px;border:1px solid var(--line);border-radius:15px;background:linear-gradient(120deg,rgba(19,29,45,.92),rgba(14,22,34,.96))}.fact{min-width:0;padding:17px 20px;border-right:1px solid var(--line)}.fact:last-child{border:0}.fact-label{display:block;margin-bottom:3px;color:#8e9bad;font-size:.64rem;letter-spacing:.1em;text-transform:uppercase}.fact-value{display:block;overflow-wrap:anywhere;color:#e8edf2;font-size:.87rem;font-weight:550}.fact-value.is-active{color:#aed5bd}.fact-value.is-beta{color:#efcf89}.fact-value.is-muted{color:#a7b0bd}.content-grid{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:clamp(28px,5vw,62px);align-items:start}.main-column{min-width:0}.section-label{display:flex;align-items:center;gap:12px;margin:0 0 15px;color:var(--gold);font-size:.66rem;letter-spacing:.16em;text-transform:uppercase}.section-label:after{content:'';height:1px;flex:1;background:var(--line)}.story{color:#c3cbd6;font-size:1rem;line-height:1.85}.story p{margin:0 0 1.18em}.story p:first-child{color:#e0e5ec;font-size:1.05rem}.tag-list{display:flex;flex-wrap:wrap;gap:8px;margin:26px 0 38px}.tag{padding:5px 11px;border:1px solid rgba(191,207,228,.15);border-radius:99px;color:#c1cad5;background:rgba(255,255,255,.025);font-size:.72rem}.source-panel,.side-card{border:1px solid var(--line);border-radius:16px;background:linear-gradient(145deg,rgba(22,33,49,.92),rgba(14,21,32,.96))}.source-panel{padding:22px 23px;margin:38px 0}.panel-heading{margin:0 0 15px;font:500 1.26rem var(--serif);letter-spacing:-.02em}.source-list{list-style:none;padding:0;margin:0}.source-list li{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:11px 0;border-top:1px solid rgba(194,207,227,.1)}.source-list a{color:#dbe2eb;text-decoration:none;font-size:.83rem}.source-list a:hover{color:var(--gold)}.source-list a span{color:var(--gold)}.source-list small{color:#8390a2;font-size:.7rem;white-space:nowrap}.side-column{position:sticky;top:22px;display:grid;gap:14px}.side-card{padding:20px}.side-kicker{margin:0 0 6px;color:#8e9bad;font-size:.64rem;letter-spacing:.12em;text-transform:uppercase}.side-card h2{margin:0 0 11px;font:500 1.3rem var(--serif)}.side-card p{margin:0;color:#aeb8c6;font-size:.82rem;line-height:1.65}.site-address{overflow-wrap:anywhere;color:#dce3ec!important;margin-bottom:16px!important}.side-link{display:inline-flex;gap:8px;color:var(--gold);text-decoration:none;font-size:.82rem;font-weight:600}.side-divider{height:1px;margin:16px 0;background:var(--line)}.share-code{display:block;padding:11px;border:1px solid rgba(194,207,227,.1);border-radius:9px;background:#0b121e;color:#bdc8d8;white-space:pre-wrap;overflow-wrap:anywhere;font: .69rem/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}.related{margin:42px 0 0;padding:31px 0 0;border-top:1px solid var(--line)}.related-head{display:flex;justify-content:space-between;align-items:end;gap:14px;margin-bottom:17px}.related-head h2{margin:0;font:500 clamp(1.5rem,3vw,2rem) var(--serif);letter-spacing:-.035em}.related-head a{color:var(--gold);text-decoration:none;font-size:.77rem}.related-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.related-card{min-width:0;display:grid;align-content:start;gap:8px;padding:17px;border:1px solid var(--line);border-radius:13px;background:rgba(18,27,41,.7);text-decoration:none;transition:border-color .2s,transform .2s}.related-card:hover{transform:translateY(-2px);border-color:rgba(231,191,120,.4)}.related-card span{color:var(--gold);font-size:.59rem;letter-spacing:.11em;text-transform:uppercase}.related-card strong{font:500 1.05rem var(--serif)}.related-card small{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:3;color:#a6b0c0;font-size:.72rem;line-height:1.55}.wish-note{display:flex;gap:11px;margin:26px 0;padding:15px 17px;border:1px solid rgba(231,191,120,.2);border-radius:12px;background:rgba(231,191,120,.045)}.wish-note span{color:var(--gold)}.wish-note p{margin:0;color:#c1cad5;font:italic .91rem/1.6 var(--serif)}.footer{margin-top:66px;padding:23px 0 34px;border-top:1px solid var(--line);color:#8793a5;font-size:.72rem}.footer-inner{display:flex;justify-content:space-between;gap:18px;align-items:center}.footer a{color:#bac4d1;text-decoration:none}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    @media(max-width:850px){.hero{grid-template-columns:minmax(0,1fr) minmax(260px,.72fr);gap:25px;padding:30px}.content-grid{grid-template-columns:minmax(0,1fr) 275px;gap:25px}.fact{padding:14px}.related-grid{gap:9px}}
    @media(max-width:680px){.shell{width:min(100% - 32px,560px)}.topbar-inner{min-height:66px}.nav{gap:13px;font-size:.76rem}.nav a:nth-child(2){display:none}.hero{grid-template-columns:1fr;gap:23px;min-height:0;padding:26px 22px 22px;border-radius:19px}.hero h1{max-width:11ch;font-size:clamp(2.65rem,13vw,4.15rem)}.lede{font-size:.98rem}.media{aspect-ratio:1.45;grid-row:1}.hero-copy{grid-row:2}.hero .eyebrow{margin-bottom:10px}.hero-actions{margin-top:21px}.fact-bar{grid-template-columns:repeat(2,1fr);margin:14px 0 36px}.fact:nth-child(2){border-right:0}.fact:nth-child(-n+2){border-bottom:1px solid var(--line)}.fact{padding:13px 14px}.content-grid{grid-template-columns:1fr;gap:25px}.side-column{position:static;grid-row:1}.content-grid .main-column{grid-row:2}.side-column .site-card{order:0}.side-column .share-card{order:1}.side-card{padding:18px}.related{margin-top:34px}.related-grid{grid-template-columns:1fr}.related-card{grid-template-columns:1fr}.source-panel{padding:18px}.footer-inner{align-items:flex-start;flex-direction:column;gap:8px}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition-duration:.01ms!important}}
  </style><style>${DETAIL_POLISH_CSS}</style></head><body><header class="topbar"><div class="shell topbar-inner"><a class="brand" href="/">Wish<span>✦</span>Meteor</a><nav class="nav" aria-label="Main navigation"><a href="/tools">Explore tools</a><a href="/about">Our story</a><a class="nav-cta" href="/submit">Share a project ↗</a></nav></div></header><main class="shell detail-main"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/tools">AI tools</a><span aria-hidden="true">/</span><span aria-current="page">${category}</span></nav><section class="hero" aria-labelledby="product-title"><div class="hero-copy"><p class="eyebrow">${category} <span class="dot">✦</span> ${status === 'beta' ? 'Early access' : 'A project worth a closer look'}</p><h1 id="product-title">${title}</h1><p class="lede">${summary}</p><div class="hero-actions"><a class="button button-primary" href="${link}" rel="noopener nofollow ugc" target="_blank">Visit ${title}<span aria-hidden="true">↗</span></a><a class="button button-secondary" href="#overview">Explore the overview <span aria-hidden="true">↓</span></a></div><p class="rating-note"><span aria-hidden="true">✦</span> An independent listing from the WishMeteor index</p></div><div class="media">${media}</div></section><section class="fact-bar" aria-label="Product details"><div class="fact"><span class="fact-label">Category</span><span class="fact-value">${category}</span></div><div class="fact"><span class="fact-label">Pricing</span><span class="fact-value">${htmlEscape(tool.pricing || 'Details on site')}</span></div><div class="fact"><span class="fact-label">Listing status</span><span class="fact-value ${statusClass}">${htmlEscape(statusLabel)}</span></div><div class="fact"><span class="fact-label">Last checked</span><span class="fact-value">${dateText(tool.lastVerifiedAt)}</span></div></section><div class="content-grid"><article class="main-column" id="overview"><h2 class="section-label">A closer look</h2><div class="story">${story || `<p>${summary}</p>`}</div>${tags ? `<div class="tag-list" aria-label="Topics">${tags}</div>` : ''}${tool.origin === 'submitted' ? blessing : ''}${tool.origin === 'submitted' ? makerWish : ''}${sources ? `<section class="source-panel" aria-labelledby="sources-title"><p class="eyebrow">Grounded in public information</p><h2 class="panel-heading" id="sources-title">Research sources</h2><ul class="source-list">${sources}</ul></section>` : ''}${related ? `<section class="related" aria-labelledby="related-title"><div class="related-head"><h2 id="related-title">More in ${category}</h2><a href="/tools">Explore the index ↗</a></div><div class="related-grid">${related}</div></section>` : ''}</article><aside class="side-column" aria-label="Project links"><section class="side-card site-card"><p class="side-kicker">The project</p><h2>Find it on the web</h2><p class="site-address">${htmlEscape(host || url)}</p><a class="side-link" href="${link}" rel="noopener nofollow ugc" target="_blank">Open the official site <span aria-hidden="true">↗</span></a><div class="side-divider"></div><p>Pricing and product details can change. Check the maker's site for the latest information.</p></section><section class="side-card share-card"><p class="side-kicker">Pass the light along</p><h2>Share this listing</h2><p>Link directly to this independent product profile.</p><code class="share-code">${htmlEscape(shareText)}</code><div class="side-divider"></div><p>Want to add your own project to the sky?</p><a class="side-link" href="/submit">Share a project <span aria-hidden="true">↗</span></a></section></aside></div></main><footer class="footer"><div class="shell footer-inner"><a class="brand" href="/">Wish<span>✦</span>Meteor</a><span>Made for people building something meaningful.</span><a href="/dofollow-policy">How our listings work</a></div></footer></body></html>`;
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

async function managedTools(env: Env): Promise<Record<string, unknown>[]> {
  const rows = await env.DB.prepare('SELECT content_json FROM managed_tools ORDER BY updated_at DESC').all<{ content_json: string }>();
  return (rows.results ?? []).flatMap((row) => { try { return [JSON.parse(row.content_json) as Record<string, unknown>]; } catch { return []; } });
}

async function handleAdmin(request: Request, env: Env, pathname: string): Promise<Response> {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  if (pathname === '/api/admin/submissions' && request.method === 'GET') {
    const result = await env.DB.prepare("SELECT id, name, url, domain, email, category, notes, make_a_wish, created_at, verdict FROM submissions WHERE verdict = 'pending' ORDER BY created_at ASC LIMIT 100").all();
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
    const row = await env.DB.prepare("SELECT id, name, url, category, make_a_wish, verdict, created_at FROM submissions WHERE id = ?").bind(id).first<{ id: number; name: string; url: string; category: string; make_a_wish: string; verdict: string; created_at: string }>();
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
    value.wish = { submittedAt: row.created_at.slice(0, 10), blessingShort: '', blessingLong: '', notifiedAt: null, ...(row.make_a_wish ? { makerWish: row.make_a_wish } : {}) };
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
    const fresh = curated;
    const asset = await env.ASSETS.fetch(request);
    if (!fresh.length) return asset;
    const categoryNames: Record<string, string> = {
      'agents-automation': 'Agents & Automation',
      'ai-chat': 'Chat & Assistants',
      'ai-coding': 'Coding',
      'education-learning': 'Education & Learning',
      'sports-fitness': 'Sports & Fitness',
      'marketing-growth': 'Marketing & Growth',
      'business-services': 'Business Services',
      'maker-tools': 'Maker Tools',
      'audio-voice': 'Voice & Music',
      'data-retrieval': 'Search & RAG',
      'evals-observability': 'Evals & Ops',
      'image-video': 'Image & Video',
      productivity: 'Writing & Research',
      uncategorized: 'Uncategorized',
    };
    const categoryIds = [...new Set(fresh.map((tool) => String(tool.category ?? 'uncategorized')))]
      .sort((a, b) => (categoryNames[a] ?? a).localeCompare(categoryNames[b] ?? b));
    const categoryFilters = [
      `<button class="catalog-filter is-active" type="button" data-category-filter="all" aria-pressed="true">All products <span>${fresh.length}</span></button>`,
      ...categoryIds.map((id) => {
        const count = fresh.filter((tool) => String(tool.category ?? 'uncategorized') === id).length;
        const label = categoryNames[id] ?? id.replace(/-/g, ' ');
        return `<button class="catalog-filter" type="button" data-category-filter="${htmlEscape(id)}" aria-pressed="false">${htmlEscape(label)} <span>${count}</span></button>`;
      }),
    ].join('');
    const cards = fresh.map((tool, index) => {
      const slug = String(tool.slug);
      const categoryId = String(tool.category ?? 'uncategorized');
      const categoryName = categoryNames[categoryId] ?? categoryId.replace(/-/g, ' ');
      const searchText = [tool.name, tool.summary, categoryName, ...(Array.isArray(tool.tags) ? tool.tags : [])].join(' ').toLowerCase();
      const coverImage = typeof tool.coverImage === 'string' && tool.coverImage === `/tool-previews/${slug}.jpg` ? tool.coverImage : `/tool-previews/${slug}.jpg`;
      const image = `<a class="tool-showcase-card__preview" href="/tool/${htmlEscape(slug)}"><img src="${htmlEscape(coverImage)}" alt="Product cover for ${htmlEscape(tool.name)}" loading="lazy" decoding="async"></a>`;
      return `<article class="card tool-showcase-card" data-catalog-item data-category="${htmlEscape(categoryId)}" data-search="${htmlEscape(searchText)}"${index >= 12 ? ' hidden' : ''}>${image}<div class="tool-showcase-card__content"><h3><a class="card-title" href="/tool/${htmlEscape(slug)}">${htmlEscape(tool.name)}</a></h3><p>${htmlEscape(tool.summary)}</p><div class="card-meta"><span class="pill">${htmlEscape(categoryName)}</span><span class="pill">${htmlEscape(tool.pricing)}</span><a class="pill" href="${htmlEscape(tool.url)}" rel="${outboundRel(tool)}" target="_blank">Visit project ↗</a></div></div></article>`;
    }).join('');
    return new HTMLRewriter()
      .on('.recently-section .grid-cards', { element(element) { element.setInnerContent(cards, { html: true }); } })
      .on('.catalog-filters', { element(element) { element.setInnerContent(categoryFilters, { html: true }); } })
      .on('.catalog-results', { element(element) { element.setInnerContent(`${curated.length} products · 12 per page`); } })
      .on('.recently-section .text-link', { element(element) { element.setAttribute('href', '#catalog-grid'); element.setInnerContent(`Browse all ${curated.length} products here ↓`); } })
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
    const tools = await managedTools(env);
    const tool = tools.find((item) => item.slug === match[1]);
    if (!tool) return null;
    const related = tools.filter((item) => item.slug !== tool.slug && item.category === tool.category && item.approved === true && item.status !== 'archived');
    return renderToolPage(tool, related);
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
  return { url: out, domain: getDomain(parsed.hostname, { allowPrivateDomains: true }) ?? parsed.hostname };
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
  const { name, url, email, category, notes, makeAWish, hp } = fields as Record<string, string | undefined>;
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
    makeAWish: (makeAWish ?? '').trim().slice(0, 320),
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

  const published = await managedTools(env);
  const isSameRoot = (value: unknown) => {
    try { return typeof value === 'string' && (getDomain(new URL(value).hostname, { allowPrivateDomains: true }) ?? new URL(value).hostname) === target.domain; }
    catch { return false; }
  };
  if (published.some((tool) => isSameRoot(tool.url))) return redirect(request, 'duplicate');

  const pending = await env.DB.prepare("SELECT domain, root_domain FROM submissions WHERE verdict = 'pending'").all<{ domain: string; root_domain: string | null }>();
  if ((pending.results ?? []).some((row) => (row.root_domain || getDomain(row.domain, { allowPrivateDomains: true }) || row.domain) === target.domain)) return redirect(request, 'duplicate');

  try {
    await env.DB.prepare(
      `INSERT INTO submissions (name, url, domain, root_domain, email, category, notes, make_a_wish, ip_hash, created_at, verdict)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    )
      .bind(submission.name, target.url, target.domain, target.domain, submission.email, submission.category, submission.notes, submission.makeAWish, ipHash, new Date().toISOString())
      .run();
  } catch (error) {
    if (String(error).includes('submissions.root_domain') || String(error).includes('submissions.domain')) return redirect(request, 'duplicate');
    throw error;
  }

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
    if (pathname === '/' || pathname === '/api/content' || pathname === '/tools' || pathname === '/tools/' || pathname.startsWith('/tool/')) {
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
