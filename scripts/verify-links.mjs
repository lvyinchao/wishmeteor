#!/usr/bin/env node
/**
 * Re-checks the outbound link of every entry that is due, and writes the result back
 * into src/content/tools. This is what grants or revokes dofollow status: the rule
 * lives in src/lib/links.mjs, and an entry that has never been checked never passes.
 *
 *   pnpm verify-links                 check the 20 most overdue entries
 *   pnpm verify-links -- --all        check every entry
 *   pnpm verify-links -- --dry        report without writing
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { parseArgs } from './lib/cli.mjs';
import { join } from 'node:path';
import { loadCatalog, PATHS } from '../src/lib/catalog.mjs';
import { isDofollow } from '../src/lib/links.mjs';
import { request } from './lib/http.mjs';
import { SITE } from '../src/lib/site.ts';

const args = parseArgs();
const MAX = Number(args.max ?? 20);
const AGE_DAYS = Number(args.age ?? 45);
const DRY = Boolean(args.dry);
const ALL = Boolean(args.all);
const today = new Date().toISOString().slice(0, 10);

async function check(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const response = await request(url, {
        method,
        retries: 1,
        timeout: 12_000,
        headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      });
      await response.body?.cancel();
      if (response.status === 405 || response.status === 501) continue;
      if (response.status < 400) return { state: 'live', status: response.status };
      // A bot wall is not a dead link: many real products answer 403 to scripts.
      if ([401, 403, 429, 451].includes(response.status)) return { state: 'blocked', status: response.status };
      return { state: 'dead', status: response.status };
    } catch (error) {
      if (method === 'GET') return { state: 'dead', status: 0, error: error.message.slice(0, 60) };
    }
  }
  return { state: 'dead', status: 0 };
}

const { tools, errors } = loadCatalog();
if (errors.length) {
  console.error(`content invalid:\n${errors.join('\n')}`);
  process.exit(1);
}

/** Stamp a link as verified by hand, for products that refuse scripted checks. */
if (args.confirm) {
  const slugs = String(args.confirm).split(',');
  for (const slug of slugs) {
    const file = join(PATHS.tools, `${slug.trim()}.json`);
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    raw.lastVerifiedAt = today;
    raw.checksFailed = 0;
    if (raw.status === 'stale') raw.status = 'active';
    raw.sources = [...(raw.sources ?? []), { type: 'manual-confirmation', url: raw.url, observedAt: today }];
    writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    console.log(`confirmed by hand: ${slug.trim()}`);
  }
  process.exit(0);
}

const overdue = tools.filter((entry) => {
  if (ALL) return true;
  if (!entry.lastVerifiedAt) return true;
  return Date.now() - Date.parse(entry.lastVerifiedAt) > AGE_DAYS * 86_400_000;
});
const queue = overdue.slice(0, MAX);
console.log(`${queue.length} of ${overdue.length} overdue entries to check (${tools.length} in index)`);

let results = [];
const concurrency = 4;
for (let i = 0; i < queue.length; i += concurrency) {
  const batch = queue.slice(i, i + concurrency);
  const checked = await Promise.all(batch.map(async (entry) => ({ entry, outcome: await check(entry.url) })));
  results = results.concat(checked);
  for (const { entry, outcome } of checked) {
    console.log(`${outcome.state.padEnd(8)} ${entry.slug.padEnd(34)} ${outcome.status || ''} ${outcome.error ?? ''}`);
  }
}

if (!DRY) {
  for (const { entry, outcome } of results) {
    if (outcome.state === 'blocked') continue;
    const file = join(PATHS.tools, `${entry.slug}.json`);
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    if (outcome.state === 'live') {
      raw.lastVerifiedAt = today;
      raw.checksFailed = 0;
      raw.lastSeenAt = today;
      if (raw.status === 'stale') raw.status = 'active';
    } else {
      raw.checksFailed = (raw.checksFailed ?? 0) + 1;
      if (raw.checksFailed >= 3 && raw.status === 'active') raw.status = 'stale';
    }
    writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  }
}

const tally = results.reduce((acc, { outcome }) => ({ ...acc, [outcome.state]: (acc[outcome.state] ?? 0) + 1 }), {});
const after = loadCatalog().tools;
const stillDofollow = after.filter((entry) => isDofollow(entry)).length;
console.log(
  `\nlive ${tally.live ?? 0} · blocked ${tally.blocked ?? 0} · dead ${tally.dead ?? 0} · ${stillDofollow} entries now carry a dofollow link (cap: ${SITE.maxDofollowPerPage} per listing page)`
);
if (tally.blocked) {
  console.log(`blocked entries are untouched: open them by hand, then run  node scripts/verify-links.mjs -- --confirm=${results.filter((r) => r.outcome.state === 'blocked').map((r) => r.entry.slug).join(',')}`);
}
process.exit(tally.dead ? 2 : 0);
