#!/usr/bin/env node
/**
 * The human gate. Nothing reaches src/content/ without this command, and it refuses
 * when the day's published budget is spent — the cap promised on /submit is enforced
 * here.
 *
 *   pnpm approve -- --submission=12 [--local]   publish a wish (needs a blessing draft)
 *   pnpm approve -- --draft=data/drafts/tools/x.json   publish a curated draft
 *   pnpm approve -- --submission=12 --dry       show what would be written
 *
 * Blessing drafts live in data/drafts/blessings/<id>.json and are written by the review
 * job; this command only applies them.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { parseArgs } from './lib/cli.mjs';
import { join } from 'node:path';
import { loadCatalog, PATHS, validateTool } from '../src/lib/catalog.mjs';
import { canonicalizeUrl } from '../src/lib/links.mjs';
import { knownEntries, reserveSlug } from './lib/dedupe.mjs';
import { makeD1 } from './lib/d1.mjs';
import { SITE } from '../src/lib/site.ts';

const args = parseArgs();
const DRY = Boolean(args.dry);
const today = new Date().toISOString().slice(0, 10);

const { tools, categories, errors } = loadCatalog();
if (errors.length) {
  console.error(`refusing to publish: the existing content is invalid\n${errors.join('\n')}`);
  process.exit(1);
}
const categoryIds = new Set(categories.map((c) => c.id));
const known = knownEntries();

function publish(slug, entry) {
  const problems = validateTool(entry, slug, categoryIds);
  if (problems.length) {
    console.error(`draft is not publishable:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  const file = join(PATHS.tools, `${slug}.json`);
  if (existsSync(file)) {
    console.error(`${file} already exists — refusing to overwrite a live entry`);
    process.exit(1);
  }
  if (DRY) {
    console.log(`would write ${file}\n\n${JSON.stringify(entry, null, 2)}`);
    return;
  }
  mkdirSync(PATHS.tools, { recursive: true });
  writeFileSync(file, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
  const recheck = loadCatalog();
  if (recheck.errors.length) {
    rmSync(file);
    console.error(`post-write validation failed, reverted:\n${recheck.errors.join('\n')}`);
    process.exit(1);
  }
  console.log(`published /tool/${slug}`);
}

if (args.draft) {
  const entry = JSON.parse(readFileSync(String(args.draft), 'utf8'));
  delete entry.slug;
  const slug = reserveSlug(known, entry.name);
  const filled = {
    ...entry,
    firstSeenAt: entry.firstSeenAt ?? today,
    lastSeenAt: today,
    lastVerifiedAt: null,
    checksFailed: 0,
    approved: true,
  };
  console.log(`curated draft → /tool/${slug}`);
  publish(slug, filled);
  process.exit(0);
}

if (!args.submission) {
  console.error('usage: pnpm approve -- --submission=<id> | --draft=<path> [--dry] [--local]');
  process.exit(1);
}

const id = Number(args.submission);
const db = makeD1({ local: Boolean(args.local) });
const row = db.get(id);
if (!row) {
  console.error(`submission #${id} not found`);
  process.exit(1);
}
if (row.verdict !== 'pending') {
  console.error(`submission #${id} is already ${row.verdict}`);
  process.exit(1);
}

const launchedToday = tools.filter((tool) => tool.wish?.submittedAt === today).length;
if (launchedToday >= SITE.dailyLaunchCap) {
  console.error(`daily cap reached: ${SITE.dailyLaunchCap} wishes per day. Nothing more launches today.`);
  process.exit(1);
}

const blessingFile = join(PATHS.drafts, 'blessings', `${id}.json`);
if (!existsSync(blessingFile)) {
  console.error(`no blessing draft at ${blessingFile}\nWrite one first: the review job drafts it, this command applies it.`);
  process.exit(1);
}
const draft = JSON.parse(readFileSync(blessingFile, 'utf8'));
const canonical = canonicalizeUrl(row.url);
if (!canonical) {
  console.error(`stored url is not canonical: ${row.url}`);
  process.exit(1);
}

const slug = reserveSlug(known, row.name);
const entry = {
  name: row.name,
  url: canonical.url,
  category: draft.category || row.category,
  tags: draft.tags?.length ? draft.tags : [draft.category || row.category].filter(Boolean),
  summary: draft.summary,
  description: draft.description,
  pricing: draft.pricing ?? 'freemium',
  status: draft.status ?? 'active',
  origin: 'submitted',
  sources: draft.sources?.length ? draft.sources : [{ type: 'submission', url: canonical.url, observedAt: today }],
  firstSeenAt: today,
  lastSeenAt: today,
  lastVerifiedAt: null,
  checksFailed: 0,
  approved: true,
  wish: {
    submittedAt: String(row.created_at).slice(0, 10),
    blessingShort: draft.blessingShort,
    blessingLong: draft.blessingLong,
    notifiedAt: null,
  },
};

console.log(`submission #${id}: ${row.name} <${canonical.url}> by ${row.email}`);
console.log(`→ /tool/${slug}  (launch ${launchedToday + 1}/${SITE.dailyLaunchCap} today)`);
publish(slug, entry);
if (!DRY) {
  db.setVerdict(id, 'approved');
  console.log('verdict recorded. Run `pnpm ship` to build, deploy and send the blessing.');
}
