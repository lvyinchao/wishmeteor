import type { APIRoute } from 'astro';
import { locales } from '../lib/i18n';
import { seoLandingSlugs } from '../lib/seo-pages';

const baseUrl = 'https://wishmeteor.net';
const urls = [
  ...locales.map((locale) => `${baseUrl}/${locale}`),
  ...seoLandingSlugs.map((slug) => `${baseUrl}/en/${slug}`),
];

export const GET: APIRoute = () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
