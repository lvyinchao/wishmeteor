export interface SitemapEntry { path:string;lastmod?:unknown }
export const SITEMAP_PAGES:string[];
export const SITEMAP_TOOL_LIMIT:number;
export function sitemapDate(value:unknown,now?:Date):string|null;
export function urlset(site:URL|undefined,items:SitemapEntry[],options?:{now?:Date}):string;
export function sitemapIndex(site:URL|undefined,items:SitemapEntry[],options?:{now?:Date}):string;
export function esc(value:string):string;
