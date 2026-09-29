/** Shared XML builders for the prerendered sitemap parts and RSS feed. */

/**
 * @param {URL | undefined} site
 * @param {{ path: string, lastmod?: string }[]} items
 */
export function urlset(site, items) {
  const base = site ?? new URL('https://example.com');
  const rows = items
    .filter((item) => !!item.path)
    .map((item) => {
      const loc = new URL(item.path, base).href;
      return `  <url><loc>${loc}</loc>${item.lastmod ? `<lastmod>${item.lastmod}</lastmod>` : ''}</url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.join('\n')}
</urlset>
`;
}

/** Entity-escape text for XML payloads. @param {string} value */
export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
