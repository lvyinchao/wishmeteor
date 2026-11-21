import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
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

const canonical = 'https://wishmeteor.net/indie-ai-tools-directory';
const title = 'Indie AI Tools Directory | WishMeteor';
const description = 'Explore WishMeteor, an indie AI tools directory for discovering projects from independent builders. Browse new listings, explore categories, and light a star.';

test('indie directory renders indexable metadata, structured data and discovery links', async () => {
  const response = await fetch(`${origin}/indie-ai-tools-directory`);
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
  assert.match(html, /<h1(?:\s[^>]*)?>Indie AI tools directory<\/h1>/);
  for (const path of ['/new', '/about', '/submit', '/submit-ai-tool', '/category/ai-coding', '/category/ai-chat', '/category/image-video', '/category/audio-voice', '/category/agents-automation', '/category/data-retrieval']) {
    assert.ok(html.includes(`href="${path}"`), path);
  }
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
  const page = schemas.find((schema) => schema['@type'] === 'WebPage');
  assert.equal(page.url, canonical);
  assert.equal(page.name, title);
  assert.equal(page.description, description);
  const faq = schemas.find((schema) => schema['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, 4);
  for (const item of faq.mainEntity) {
    assert.ok(html.includes(item.name));
    assert.equal(item.acceptedAnswer['@type'], 'Answer');
    assert.ok(item.acceptedAnswer.text);
  }
});

test('about and submission guide link back and sitemap and robots permit the directory', async () => {
  for (const path of ['/about', '/submit-ai-tool']) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, path);
    assert.ok((await response.text()).includes('href="/indie-ai-tools-directory"'), path);
  }
  const sitemap = await fetch(`${origin}/sitemap-pages.xml`);
  assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  assert.ok(xml.includes(`<loc>${canonical}</loc>`));
  assert.ok(!xml.includes(`<loc>${canonical}/</loc>`));
  const robots = await fetch(`${origin}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.doesNotMatch(await robots.text(), /Disallow:\s*\/indie-ai-tools-directory/i);
});
