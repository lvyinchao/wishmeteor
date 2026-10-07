/** Shared XML builders for both live and prerendered sitemaps. */
export const SITEMAP_PAGES=['/','/tools','/new','/submit','/about','/privacy','/dofollow-policy','/free-dofollow-backlinks','/news','/blog','/updates'];
export const SITEMAP_TOOL_LIMIT=10000;

/** Return a real, non-future UTC modification date; unknown dates stay absent.
 * @param {unknown} value
 * @param {Date} [now]
 * @returns {string | null}
 */
export function sitemapDate(value,now=new Date()) {
  if(value instanceof Date)value=Number.isFinite(value.getTime())?value.toISOString():'';
  if(typeof value!=='string')return null;
  let input=value.trim();
  // SQLite's UTC CURRENT_TIMESTAMP representation is not a W3C timestamp.
  if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(input))input=input.replace(' ','T')+'Z';
  const date=/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/.exec(input);
  if(!date||date[1]==='0000')return null;
  const day=input.slice(0,10),calendar=new Date(day+'T00:00:00Z');
  if(!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,10)!==day)return null;
  if(date[4]&&(Number(date[4])>23||Number(date[5])>59||Number(date[6])>59))return null;
  if(date[7]&&date[7]!=='Z'){
    const [hours,minutes]=date[7].slice(1).split(':').map(Number);
    if(hours>14||minutes>59||(hours===14&&minutes!==0))return null;
  }
  const timestamp=Date.parse(date[4]?input:day+'T00:00:00Z');
  if(!Number.isFinite(timestamp)||timestamp>now.getTime())return null;
  return new Date(timestamp).toISOString().slice(0,10);
}

/**
 * @param {URL | undefined} site
 * @param {{ path: string, lastmod?: unknown }[]} items
 * @param {{now?:Date}} [options]
 */
export function urlset(site, items,options={}) {
  return xmlEntries('urlset','url',site,items,options);
}

/** @param {URL|undefined} site @param {{path:string,lastmod?:unknown}[]} items @param {{now?:Date}} [options] */
export function sitemapIndex(site,items,options={}) {
  return xmlEntries('sitemapindex','sitemap',site,items,options);
}

/** @param {string} root @param {string} tag @param {URL|undefined} site @param {{path:string,lastmod?:unknown}[]} items @param {{now?:Date}} options */
function xmlEntries(root,tag,site,items,options) {
  const base=site??new URL('https://wishmeteor.net'),now=options.now??new Date(),seen=new Set();
  const rows=[];
  for(const item of items){
    if(!item.path)continue;
    const url=new URL(item.path,base);url.hash='';
    if(url.origin!==base.origin||seen.has(url.href))continue;
    seen.add(url.href);const lastmod=sitemapDate(item.lastmod,now);
    rows.push(`  <${tag}><loc>${esc(url.href)}</loc>${lastmod?`<lastmod>${lastmod}</lastmod>`:''}</${tag}>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.join('\n')}
</${root}>
`;
}

/** Entity-escape text for XML payloads. @param {string} value */
export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
