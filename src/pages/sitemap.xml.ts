import type { APIRoute } from 'astro';
import { sitemapIndex } from '../lib/sitemap.mjs';

export const prerender = true;

const parts = ['sitemap-pages.xml', 'sitemap-tools.xml', 'sitemap-posts.xml'];

export const GET: APIRoute = ({ site }) => {
  const body = sitemapIndex(site,parts.map(part=>({path:'/'+part})));
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
