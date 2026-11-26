import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { dev } from 'astro';
import { SITE } from '../src/lib/site.ts';

process.env.ASTRO_TELEMETRY_DISABLED = '1';
process.env.ASTRO_DISABLE_UPDATE_CHECK = 'true';

const path = '/futurepedia-alternative-ai-tools';
const canonical = SITE.url + path;
const title = `Futurepedia Alternative for AI Tools | ${SITE.name}`;
let server;
let origin;

before(async () => {
  server = await dev({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
  origin = `http://127.0.0.1:${server.address.port}`;
});
after(async () => {
  if (server) await server.stop();
});

test('guide serves one indexable canonical and matching open graph and structured data', async () => {
  const response = await fetch(origin + path, { redirect: 'manual' });
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.headers.get('x-robots-tag') ?? '', /noindex|nofollow|none/i);
  const html = await response.text();
  assert.doesNotMatch(html, /<meta\s+name="(?:robots|googlebot)"[^>]*\b(?:noindex|nofollow|none)\b/i);
  assert.deepEqual([...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map(match => match[1]), [canonical]);
  assert.ok(html.includes(`<title>${title}</title>`));
  assert.match(html, /<h1[^>]*>A Futurepedia alternative for AI tools<\/h1>/);
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  assert.match(description, /Futurepedia alternative/i);
  for (const [property, value] of Object.entries({ title, description, url: canonical, type: 'website' })) {
    assert.ok(html.includes(`<meta property="og:${property}" content="${value}">`), property);
  }

  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
  const page = schemas.find(schema => schema['@type'] === 'WebPage');
  assert.equal(page.url, canonical);
  assert.equal(page.name, title);
  assert.equal(page.description, description);
  const faq = schemas.find(schema => schema['@type'] === 'FAQPage');
  const section = html.match(/<section\b[^>]*aria-labelledby="faq"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(section);
  const visibleFaq = [...section.matchAll(/<h3\b[^>]*>(.*?)<\/h3>\s*<p\b[^>]*>(.*?)<\/p>/gs)]
    .map(([, question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    }));
  assert.ok(visibleFaq.length > 0);
  assert.deepEqual(faq.mainEntity, visibleFaq);
});

test('dated Futurepedia observations link to the catalog and readers can browse or list a tool', async () => {
  const html = await (await fetch(origin + path)).text();
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
  assert.match(main, /November 26, 2026/);
  for (const link of [
    'https://www.futurepedia.io/', 'https://www.futurepedia.io/ai-tools',
    '/new', '/submit-ai-tool', '/indie-ai-tools-directory', '/about',
    '/blog/launch-weekly', '/product-hunt-alternative-ai-tools',
  ]) {
    assert.ok(main.includes(`href="${link}"`), link);
  }
  const hub = await fetch(origin + '/indie-ai-tools-directory');
  assert.equal(hub.status, 200);
  assert.ok((await hub.text()).includes(`href="${path}"`));
});

test('the static pages sitemap lists only the slashless guide and robots permits crawling', async () => {
  const sitemap = await fetch(origin + '/sitemap-pages.xml');
  assert.equal(sitemap.status, 200);
  const urls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(urls.filter(url => url === canonical || url === canonical + '/'), [canonical]);
  const robots = await fetch(origin + '/robots.txt');
  assert.equal(robots.status, 200);
  const rules = await robots.text();
  assert.match(rules, /^User-agent: \*\s+Allow: \/$/m);
  for (const [, prefix] of rules.matchAll(/^Disallow:\s*(\/\S*)$/gm)) {
    assert.ok(!path.startsWith(prefix), prefix);
  }
});
