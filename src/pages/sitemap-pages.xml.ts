import type { APIRoute } from 'astro';
import { loadPublicCatalog } from '../lib/public-content.ts';
import { urlset } from '../lib/sitemap.mjs';

export const prerender = true;

const evergreen = [
  { path: '/', lastmod: '' },
  { path: '/submit', lastmod: '' },
  { path: '/free-dofollow-backlinks', lastmod: '' },
  { path: '/dofollow-policy', lastmod: '' },
  { path: '/about', lastmod: '' },
  { path: '/privacy', lastmod: '' },
  { path: '/blog', lastmod: '' },
  { path: '/new', lastmod: '' },
  { path: '/tools', lastmod: '' },
];

export const GET: APIRoute = ({ site }) => {
  const { categories, tools } = loadPublicCatalog();
  const newest = tools.map((entry) => entry.lastVerifiedAt).sort().at(-1) ?? '';
  const items = [
    ...evergreen.map((item) => ({ ...item, lastmod: item.lastmod || newest })),
    ...categories.map((category) => ({ path: `/category/${category.id}`, lastmod: newest })),
  ];
  return new Response(urlset(site, items), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
