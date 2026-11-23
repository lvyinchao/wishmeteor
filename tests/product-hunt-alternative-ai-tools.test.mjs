import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dev } from 'astro';

process.env.ASTRO_TELEMETRY_DISABLED = '1';
process.env.ASTRO_DISABLE_UPDATE_CHECK = 'true';

let server;
let origin;
before(async () => {
  server = await dev({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
  origin = `http://127.0.0.1:${server.address.port}`;
});
after(async () => {
  if (server) await server.stop();
});

const path = '/product-hunt-alternative-ai-tools';
const canonical = `https://wishmeteor.net${path}`;
const title = 'Product Hunt Alternative for AI Tools | WishMeteor';
const description = 'Looking for a Product Hunt alternative for AI tools? Explore WishMeteor, a free directory for independent products beyond a single launch day.';

test('alternative guide has indexable metadata, matching schemas and useful links', async () => {
  const response = await fetch(`${origin}${path}`);
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.headers.get('x-robots-tag') ?? '', /noindex|nofollow/i);
  const html = await response.text();
  assert.ok(html.includes(`<title>${title}</title>`));
  assert.ok(html.includes(`<meta name="description" content="${description}">`));
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`));
  assert.ok(html.includes(`<meta property="og:title" content="${title}">`));
  assert.ok(html.includes(`<meta property="og:description" content="${description}">`));
  assert.ok(html.includes(`<meta property="og:url" content="${canonical}">`));
  assert.doesNotMatch(html, /<meta\s+name="robots"[^>]*(noindex|nofollow)/i);
  assert.match(html, /<h1(?:\s[^>]*)?>A Product Hunt alternative for AI tools<\/h1>/);
  for (const link of ['/submit-ai-tool', '/indie-ai-tools-directory', '/new-ai-tools', '/new', '/about', '/blog/launch-weekly', '/dofollow-policy']) {
    assert.ok(html.includes(`href="${link}"`), link);
  }
  assert.match(html, /approval is not guaranteed/i);
  assert.match(html, /authorized for automatic publication can publish directly/i);
  assert.match(html, /not guaranteed to stay forever/i);
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
  const page = schemas.find((schema) => schema['@type'] === 'WebPage');
  assert.equal(page.url, canonical);
  assert.equal(page.name, title);
  assert.equal(page.description, description);
  const faq = schemas.find((schema) => schema['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, 3);
  for (const item of faq.mainEntity) {
    assert.ok(html.includes(item.name));
    assert.equal(item.acceptedAnswer['@type'], 'Answer');
    assert.ok(html.includes(item.acceptedAnswer.text));
  }
});

test('directory links to the guide and sitemap and robots permit its canonical URL', async () => {
  const directory = await fetch(`${origin}/indie-ai-tools-directory`);
  assert.equal(directory.status, 200);
  assert.ok((await directory.text()).includes(`href="${path}"`));
  const sitemap = await fetch(`${origin}/sitemap-pages.xml`);
  assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  assert.ok(xml.includes(`<loc>${canonical}</loc>`));
  assert.ok(!xml.includes(`<loc>${canonical}/</loc>`));
  const robots = await fetch(`${origin}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.doesNotMatch(await robots.text(), /Disallow:\s*\/product-hunt-alternative-ai-tools/i);
  assert.equal((await fetch(`${origin}/llms.txt`)).status, 404);
});

test('static asset configuration drops trailing slashes for the guide', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.assets.html_handling, 'drop-trailing-slash');
  assert.ok(!config.assets.run_worker_first.includes(path));
  assert.ok(!config.assets.run_worker_first.includes(`${path}/*`));
});
