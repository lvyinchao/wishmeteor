import type { APIRoute } from 'astro';
import { urlset,SITEMAP_PAGES } from '../lib/sitemap.mjs';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  // D1 adds current directories and their modification dates at request time.
  const items = SITEMAP_PAGES.map(path=>({path}));
  return new Response(urlset(site, items), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
