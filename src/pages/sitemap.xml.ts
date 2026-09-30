import type { APIRoute } from 'astro';
import { loadPublicCatalog } from '../lib/public-content.ts';

export const prerender = true;

const parts = ['sitemap-pages.xml', 'sitemap-tools.xml', 'sitemap-posts.xml'];

export const GET: APIRoute = ({ site }) => {
  const { tools } = loadPublicCatalog();
  const newest = tools
    .map((entry) => entry.lastVerifiedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${parts.map((part) => `  <sitemap><loc>${new URL(`/${part}`, site).href}</loc>${newest ? `<lastmod>${newest}</lastmod>` : ''}</sitemap>`).join('\n')}
</sitemapindex>
`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
