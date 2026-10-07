import type { APIRoute } from 'astro';
import { getPublicPosts } from '../lib/public-content.ts';
import { urlset } from '../lib/sitemap.mjs';

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const posts = await getPublicPosts();
  const items = posts
    .map((post) => ({
      path: `/blog/${post.id}`,
      lastmod: post.data.updatedDate ?? post.data.pubDate,
    }))
    .sort((a, b) => b.lastmod.valueOf()-a.lastmod.valueOf());
  return new Response(urlset(site, items), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
