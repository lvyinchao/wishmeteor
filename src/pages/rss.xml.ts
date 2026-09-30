import type { APIRoute } from 'astro';
import { esc } from '../lib/sitemap.mjs';
import { SITE } from '../lib/site.ts';
import { getPublicPosts } from '../lib/public-content.ts';

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const posts = (await getPublicPosts())
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
    .slice(0, 20);
  const items = posts.map((post) => {
    const url = new URL(`/blog/${post.id}`, site).href;
    return `  <item>
    <title>${esc(post.data.title)}</title>
    <link>${url}</link>
    <guid isPermaLink="true">${url}</guid>
    <pubDate>${post.data.pubDate.toUTCString()}</pubDate>
    <description>${esc(post.data.description)}</description>
  </item>`;
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(`${SITE.name} logbook`)}</title>
  <link>${SITE.url}/blog</link>
  <atom:link href="${new URL('/rss.xml', site).href}" rel="self" type="application/rss+xml"/>
  <description>${esc(SITE.description)}</description>
  <language>en</language>
${items.join('\n')}
</channel>
</rss>
`;
  return new Response(body, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
};
