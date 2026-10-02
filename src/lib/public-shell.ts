import { SITE } from './site.ts';
import { escapeHtml as e,safeJson } from './html.ts';
import { canonicalUrl } from './jsonld.ts';

export interface PageHead {
  title:string;description:string;path:string;image?:string;imageAlt?:string;type?:'website'|'article';
  publishedTime?:string;modifiedTime?:string;noindex?:boolean;jsonLd?:object[];
}
export function publicHead(p:PageHead):string {
  const image=p.image?.startsWith('https://')?p.image:`${SITE.url}${p.image ?? '/og-default.png'}`;
  const canonical=canonicalUrl(p.path);
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles/site.css"><link rel="alternate" type="application/rss+xml" title="WishMeteor changes" href="/rss.xml"><link rel="sitemap" type="application/xml" href="/sitemap.xml"><title>${e(p.title)}</title><meta name="description" content="${e(p.description)}"><link rel="canonical" href="${e(canonical)}">${p.noindex?'<meta name="robots" content="noindex,nofollow">':''}
  <meta property="og:site_name" content="WishMeteor"><meta property="og:title" content="${e(p.title)}"><meta property="og:description" content="${e(p.description)}"><meta property="og:url" content="${e(canonical)}"><meta property="og:type" content="${p.type ?? 'website'}"><meta property="og:image" content="${e(image)}"><meta property="og:image:alt" content="${e(p.imageAlt ?? p.title)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:locale" content="en_US"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(p.title)}"><meta name="twitter:description" content="${e(p.description)}"><meta name="twitter:image" content="${e(image)}"><meta name="theme-color" content="#060917">${p.publishedTime?`<meta property="article:published_time" content="${e(p.publishedTime)}">`:''}${p.modifiedTime?`<meta property="article:modified_time" content="${e(p.modifiedTime)}">`:''}${(p.jsonLd ?? []).map(data=>`<script type="application/ld+json">${safeJson(data)}</script>`).join('')}`;
}
export function publicHeader(path:string):string {
  const active=(href:string)=>path===href||path.startsWith(href+'/')||(href==='/new'&&(path==='/'||path.startsWith('/tools')||path.startsWith('/category/')));
  return `<header class="site-header"><div class="shell"><a class="brand" href="/" aria-label="WishMeteor home"><img src="/favicon.svg" width="40" height="40" alt=""><span>WishMeteor</span></a><nav class="site-nav" aria-label="Main">${[['/new','Wish Sky'],['/news','News'],['/blog','Blog'],['/about','Our story']].map(([href,label])=>`<a href="${href}"${active(href)?' aria-current="page"':''}>${label}</a>`).join('')}<a class="btn btn-primary" href="/submit">Make a wish</a><a href="/account" data-account-nav>Sign in</a><details class="account-menu" data-account-menu hidden><summary class="account-menu__trigger" aria-label="Account menu"><span aria-hidden="true">♙</span><span class="account-menu__identity" data-account-identity></span><span aria-hidden="true">⌄</span></summary><div class="account-menu__panel"><a href="/account">Your account</a><button type="button" data-logout>Sign out</button></div></details></nav></div></header>`;
}
export function publicFooter():string {
  return `<footer class="site-footer"><div class="shell"><div><strong>WishMeteor</strong> — ${e(SITE.tagline)}<br><span>A wishing well and gathering place for people building AI.</span></div><nav aria-label="Footer">${[['/new','Wish Sky'],['/news','News'],['/blog','Blog'],['/submit','Make a wish'],['/dofollow-policy','Community agreement'],['/updates','Weekly changes'],['/about','Our story'],['/privacy','Privacy']].map(([href,label])=>`<a href="${href}">${label}</a>`).join('')}</nav><div>© ${new Date().getFullYear()} WishMeteor</div></div></footer>`;
}
export function publicScripts(measurementId='G-QV8KGLLDXR',privatePage=false):string {
  return `<script type="module" src="/site.js"${privatePage?' data-private="true"':` data-measurement-id="${e(measurementId)}"`}></script>`;
}
export function publicDocument(p:PageHead,body:string,measurementId?:string):string {
  return `<!doctype html><html lang="en"><head>${publicHead(p)}</head><body><a class="skip-link" href="#main">Skip to content</a>${publicHeader(p.path)}<main id="main" class="shell">${body}</main>${publicFooter()}${publicScripts(measurementId,p.noindex)}</body></html>`;
}
