import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const body = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${new URL('/sitemap.xml', site).href}
`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
