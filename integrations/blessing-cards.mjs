import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../scripts/lib/frontmatter.mjs';
import { OG } from '../src/lib/og.mjs';

const WIDTH = 1200;
const HEIGHT = 630;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let loadedFonts = null;
async function loadFonts() {
  if (loadedFonts) return loadedFonts;
  const { readFileSync } = await import('node:fs');
  const file = (weight) => readFileSync(join(root, 'node_modules/@fontsource/inter/files', `inter-latin-${weight}-normal.woff`));
  loadedFonts = [400, 600, 700].map((weight) => ({ name: 'Inter', data: file(weight), weight, style: 'normal' }));
  return loadedFonts;
}

const quote = '\u201c';

function card({ eyebrow, title, body, footer }) {
  const blessing = body.startsWith(quote);
  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '60px 68px',
        background: 'linear-gradient(150deg, #0d1530 0%, #060917 62%, #121d3d 100%)',
        color: '#e9edfa',
        fontFamily: 'Inter',
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center', gap: '14px', fontSize: '25px', color: '#ffd166', letterSpacing: '2px' },
            children: [
              { type: 'div', props: { style: { width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(120deg,#ffd166,#f0973f)' } } },
              { type: 'div', props: { children: 'WISHMETEOR' } },
              ...(eyebrow ? [{ type: 'div', props: { style: { color: '#9aa6c8', fontSize: '23px' }, children: `· ${eyebrow.toUpperCase()}` } }] : []),
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', gap: '20px' },
            children: [
              { type: 'div', props: { style: { fontSize: '62px', fontWeight: 700, lineHeight: 1.12, letterSpacing: '-1.5px' }, children: title } },
              { type: 'div', props: { style: { fontSize: '29px', lineHeight: 1.45, color: blessing ? '#ffd166' : '#9aa6c8', maxWidth: '960px' }, children: body } },
            ],
          },
        },
        { type: 'div', props: { style: { fontSize: '25px', color: '#9aa6c8' }, children: footer } },
      ],
    },
  };
}

async function renderCard(target, props) {
  const satori = (await import('satori')).default;
  const { Resvg } = await import('@resvg/resvg-js');
  const fonts = await loadFonts();
  const svg = await satori(card(props), { width: WIDTH, height: HEIGHT, fonts });
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
    font: { loadSystemFonts: false },
  }).render().asPng();
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, png);
}

async function readPosts() {
  const dir = join(root, 'src/content/posts');
  let files = [];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const posts = [];
  for (const file of files.filter((f) => f.endsWith('.md'))) {
    const { data } = parseFrontmatter(await readFile(join(dir, file), 'utf8'));
    if (data.title && data.description) posts.push({ id: file.replace(/\.md$/, ''), data });
  }
  return posts;
}

/** Generates every og:image the prerendered pages point at. */
export function blessingCards() {
  return {
    name: 'wishmeteor:blessing-cards',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const { loadCatalog } = await import('../src/lib/catalog.mjs');
        const { SITE } = await import('../src/lib/site.ts');
        const { tools, categories } = loadCatalog();
        const out = (rel) => join(dir.pathname, rel.replace(/^\//, ''));
        let count = 0;

        await renderCard(out(OG.home), {
          eyebrow: 'AI tools index',
          title: SITE.tagline,
          body: 'Submit your product, clear review, keep a dofollow link — and get a blessing written by hand.',
          footer: 'wishmeteor.net/submit',
        });
        count += 1;

        for (const entry of tools) {
          await renderCard(out(OG.tool(entry.slug)), {
            eyebrow: entry.origin === 'submitted' ? 'launched wish' : entry.category,
            title: entry.name,
            body: entry.wish?.blessingShort ?? entry.summary,
            footer: `wishmeteor.net/tool/${entry.slug}`,
          });
          count += 1;
        }

        for (const category of categories) {
          const total = tools.filter((t) => t.category === category.id && t.status !== 'archived').length;
          await renderCard(out(OG.category(category.id)), {
            eyebrow: 'category',
            title: category.title,
            body: category.description,
            footer: `${total} entries · wishmeteor.net`,
          });
          count += 1;
        }

        for (const post of await readPosts()) {
          await renderCard(out(OG.post(post.id)), {
            eyebrow: 'logbook',
            title: post.data.title,
            body: post.data.description,
            footer: `wishmeteor.net/blog/${post.id}`,
          });
          count += 1;
        }

        logger.info(`generated ${count} social cards`);
      },
    },
  };
}
