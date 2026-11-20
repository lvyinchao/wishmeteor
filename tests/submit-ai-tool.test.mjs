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

const canonical = 'https://wishmeteor.net/submit-ai-tool';
const title = 'Submit Your AI Tool for Free | WishMeteor';
const description = 'Submit your AI tool for free to WishMeteor. Prepare your product details, understand the review process, and share your project with AI builders.';

test('free submission guide renders indexable metadata, structured data and useful links', async () => {
  const response = await fetch(`${origin}/submit-ai-tool`);
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
  assert.match(html, /<h1(?:\s[^>]*)?>Submit your AI tool for free<\/h1>/);
  for (const path of ['/submit', '/about', '/dofollow-policy', '/free-dofollow-backlinks', '/new']) {
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

test('submission page links back and static sitemap and robots permit the guide', async () => {
  const submit = await fetch(`${origin}/submit`);
  assert.equal(submit.status, 200);
  assert.ok((await submit.text()).includes('href="/submit-ai-tool"'));
  const sitemap = await fetch(`${origin}/sitemap-pages.xml`);
  assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  assert.ok(xml.includes(`<loc>${canonical}</loc>`));
  assert.ok(!xml.includes(`<loc>${canonical}/</loc>`));
  const robots = await fetch(`${origin}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.doesNotMatch(await robots.text(), /Disallow:\s*\/submit-ai-tool/i);
});
