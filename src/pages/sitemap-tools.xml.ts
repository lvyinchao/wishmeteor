import type { APIRoute } from 'astro';
import { loadCatalog } from '../lib/catalog.mjs';
import { isListable } from '../lib/links.mjs';
import { urlset } from '../lib/sitemap.mjs';

export const prerender = true;

/** Only entries whose outbound link is live and dofollow belong in the sitemap. */
export const GET: APIRoute = ({ site }) => {
  const { tools } = loadCatalog();
  const items = tools
    .filter((entry) => isListable(entry))
    .map((entry) => ({ path: `/tool/${entry.slug}`, lastmod: entry.lastVerifiedAt }))
    .sort((a, b) => (a.lastmod < b.lastmod ? 1 : -1));
  return new Response(urlset(site, items), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
