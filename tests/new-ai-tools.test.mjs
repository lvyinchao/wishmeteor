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

const canonical = 'https://wishmeteor.net/new-ai-tools';
const title = 'New AI Tools This Week | WishMeteor';
const description = 'Discover newly listed independent AI tools on WishMeteor. Browse the latest projects, explore developer tools, and catch up with Launch Weekly.';

test('new AI tools guide has indexable metadata, matching schemas and useful links', async () => {
  const response = await fetch(`${origin}/new-ai-tools`);
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
  assert.match(html, /<h1(?:\s[^>]*)?>New AI tools this week<\/h1>/);
  for (const path of ['/new', '/indie-ai-tools-directory', '/blog/launch-weekly', '/submit-ai-tool', '/about', '/category/ai-coding', '/category/agents-automation', '/category/data-retrieval']) {
    assert.ok(html.includes(`href="${path}"`), path);
  }
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
  assert.ok((await directory.text()).includes('href="/new-ai-tools"'));
  const sitemap = await fetch(`${origin}/sitemap-pages.xml`);
  assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  assert.ok(xml.includes(`<loc>${canonical}</loc>`));
  assert.ok(!xml.includes(`<loc>${canonical}/</loc>`));
  const robots = await fetch(`${origin}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.doesNotMatch(await robots.text(), /Disallow:\s*\/new-ai-tools/i);
});

test('asset configuration drops trailing slashes on static pages', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.assets.html_handling, 'drop-trailing-slash');
  assert.ok(!config.assets.run_worker_first.includes('/new-ai-tools'));
  assert.ok(!config.assets.run_worker_first.includes('/new-ai-tools/*'));
});
