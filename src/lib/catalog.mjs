/**
 * The tools/wishes catalog: one JSON file per entry under src/content/tools/.
 * Plain node:fs so the same module serves the Astro build and the CLI scripts.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonicalizeUrl } from './links.mjs';
import { SITE } from './site.ts';

export const PRICING = ['free', 'freemium', 'paid', 'open-source'];
export const STATUS = ['active', 'beta', 'stale', 'archived'];
export const ORIGIN = ['curated', 'submitted'];

const ROOT = resolve(import.meta.dirname, '../..');
export const PATHS = {
  root: ROOT,
  tools: join(ROOT, 'src/content/tools'),
  categories: join(ROOT, 'src/content/categories.json'),
  drafts: join(ROOT, 'data/drafts'),
  inbox: join(ROOT, 'data/inbox'),
  cache: join(ROOT, 'data/cache'),
  state: join(ROOT, 'data/state.json'),
};

/** @param {string} p */
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/**
 * @typedef {Object} ToolEntry
 * @property {string} slug
 * @property {string} name
 * @property {string} url
 * @property {string} domain
 * @property {string} category
 * @property {string[]} tags
 * @property {string} summary
 * @property {string} description
 * @property {typeof PRICING[number]} pricing
 * @property {typeof STATUS[number]} status
 * @property {typeof ORIGIN[number]} origin
 * @property {{type: string, url: string, observedAt: string}[]} sources
 * @property {string} firstSeenAt
 * @property {string} lastSeenAt
 * @property {string} lastVerifiedAt
 * @property {number} checksFailed
 * @property {boolean} approved
 * @property {boolean} [featured]
 * @property {{ submittedAt: string, blessingShort: string, blessingLong: string, cardPath?: string, notifiedAt?: string | null }} [wish]
 */

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Collect human-readable problems for one entry. @returns {string[]} */
export function validateTool(raw, slug, categoryIds) {
  const errors = [];
  const need = (ok, msg) => { if (!ok) errors.push(msg); };
  need(typeof raw.name === 'string' && raw.name.length > 0 && raw.name.length <= 80, 'name must be 1-80 chars');
  need(typeof raw.summary === 'string' && raw.summary.length >= 40 && raw.summary.length <= 160, 'summary must be 40-160 chars');
  need(typeof raw.description === 'string' && raw.description.length >= SITE.minDescriptionChars, `description must be >= ${SITE.minDescriptionChars} chars`);
  need(PRICING.includes(raw.pricing), `pricing must be one of ${PRICING.join('|')}`);
  need(STATUS.includes(raw.status), `status must be one of ${STATUS.join('|')}`);
  need(ORIGIN.includes(raw.origin), `origin must be one of ${ORIGIN.join('|')}`);
  need(Array.isArray(raw.tags) && raw.tags.length > 0, 'tags must be a non-empty array');
  need(categoryIds.has(raw.category), `category "${raw.category}" is not defined in categories.json`);
  need(Array.isArray(raw.sources) && raw.sources.length > 0, 'sources must cite at least one URL');
  need(raw.approved === true, 'only approved entries may live in src/content/tools');
  need(isDate(raw.firstSeenAt) && isDate(raw.lastSeenAt), 'firstSeenAt/lastSeenAt must be YYYY-MM-DD');
  need(raw.lastVerifiedAt === null || isDate(raw.lastVerifiedAt), 'lastVerifiedAt must be YYYY-MM-DD or null when never checked');
  need(Number.isInteger(raw.checksFailed) && raw.checksFailed >= 0, 'checksFailed must be an integer >= 0');
  const canonical = canonicalizeUrl(raw.url);
  need(!!canonical, 'url must be a valid http(s) URL');
  if (canonical) need(canonical.url === raw.url, `url is not canonical, expected ${canonical.url}`);
  const wish = raw.wish;
  if (raw.origin === 'submitted') {
    need(!!wish, 'submitted entries must carry a wish object');
  }
  if (wish) {
    need(isDate(wish.submittedAt), 'wish.submittedAt must be YYYY-MM-DD');
    need(typeof wish.blessingShort === 'string' && wish.blessingShort.length <= 120, 'wish.blessingShort must be <= 120 chars');
    need(typeof wish.blessingLong === 'string' && wish.blessingLong.length >= 120 && wish.blessingLong.length <= 600, 'wish.blessingLong must be 120-600 chars');
    need('notifiedAt' in wish, 'wish.notifiedAt must be present (null until the blessing email is sent)');
  }
  return errors.map((e) => `${slug}: ${e}`);
}

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {string} title
 * @property {string} description
 * @property {string} hubCopy
 * @property {number} order
 */

/** @returns {{ tools: ToolEntry[], categories: Category[], errors: string[] }} */
export function loadCatalog() {
  const categories = loadCategories();
  const categoryIds = new Set(categories.map((c) => c.id));
  const tools = [];
  const errors = [];
  const dir = PATHS.tools;
  if (existsSync(dir)) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      const slug = file.replace(/\.json$/, '');
      let raw;
      try {
        raw = readJson(join(dir, file));
      } catch (e) {
        errors.push(`${slug}: invalid JSON (${e.message})`);
        continue;
      }
      const found = validateTool(raw, slug, categoryIds);
      errors.push(...found);
      const canonical = canonicalizeUrl(raw.url);
      tools.push({ ...raw, slug, domain: canonical ? canonical.domain : new URL(raw.url).hostname });
    }
  }
  return { tools, errors, categories };
}

/** @returns {Category[]} */
export function loadCategories() {
  const data = readJson(PATHS.categories);
  return [...data].sort((a, b) => a.order - b.order);
}

/** @param {ToolEntry[]} tools @param {(e: ToolEntry) => boolean} [extra] */
export function published(tools, extra = () => true) {
  return tools.filter((t) => t.approved && t.status !== 'archived' && extra(t));
}

export const toolPath = (slug) => `/tool/${slug}`;
export const categoryPath = (id) => `/category/${id}`;

/**
 * Newest first: wishes by their launch date, curated entries by last touch.
 * @param {ToolEntry[]} tools
 */
export function sortNewest(tools) {
  const stamp = (t) => t.wish?.submittedAt ?? t.lastVerifiedAt ?? t.firstSeenAt;
  return [...tools].sort((a, b) => (stamp(a) < stamp(b) ? 1 : stamp(a) > stamp(b) ? -1 : a.slug.localeCompare(b.slug)));
}

/** @param {ToolEntry[]} tools @param {string} id */
export function inCategory(tools, id) {
  return sortNewest(tools.filter((t) => t.category === id && t.status !== 'archived'));
}

/** Sibling entries for the detail page, excluding the entry itself. */
export function related(tools, entry, limit = 6) {
  const same = sortNewest(tools.filter((t) => t.category === entry.category && t.slug !== entry.slug));
  if (same.length >= limit) return same.slice(0, limit);
  const sharedTag = sortNewest(
    tools.filter((t) => t.slug !== entry.slug && t.category !== entry.category && t.tags.some((tag) => entry.tags.includes(tag)))
  );
  return [...same, ...sharedTag].slice(0, limit);
}

/** Launched wishes (submission-origin entries) for the wish wall. */
export function launchedWishes(tools, limit = 12) {
  return sortNewest(tools.filter((t) => t.origin === 'submitted' && !!t.wish)).slice(0, limit);
}
