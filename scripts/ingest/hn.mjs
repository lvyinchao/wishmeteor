#!/usr/bin/env node
/**
 * Hacker News through the Algolia API: recent high-point stories and Show HN launches.
 * Findings land in data/inbox/hn-<date>.jsonl.
 *
 *   node scripts/ingest/hn.mjs [--dry] [--points=45]
 */
import { parseArgs } from '../lib/cli.mjs';
import { recordSourceOutcome,normalizeCandidates } from '../lib/source-outcome.mjs';
import { getJson } from '../lib/http.mjs';
import { loadState, saveState, mark, since, inboxFile, writeInbox } from '../lib/state.mjs';
import { isAiRelated, score } from '../lib/relevance.mjs';
import { knownEntries,isKnown } from '../lib/dedupe.mjs';

const args = parseArgs();
const DRY = Boolean(args.dry);
const MIN_POINTS = Number(args.points ?? 45);
const today = new Date().toISOString().slice(0, 10);
const state = loadState();
const known = knownEntries();
const watermark = since(state, 'hn', 24);
const epoch = Math.floor(Date.parse(watermark) / 1000);

const queries = [
  { label: 'story', url: `https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=created_at_i>${epoch},points>=${MIN_POINTS}&hitsPerPage=60` },
  { label: 'show_hn', url: `https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&numericFilters=created_at_i>${epoch},points>=10&hitsPerPage=60` },
];

const rows = [];
const failures = [];
let newest = watermark;

for (const query of queries) {
  try {
    const data = await getJson(query.url);
    for (const hit of data.hits ?? []) {
      if (!hit.title) continue;
      if (!isAiRelated(hit.title, hit.url, hit.story_text, hit._tags)) continue;
      const link = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
      rows.push({
        key: `hn:${hit.objectID}`,
        kind: hit._tags?.includes('show_hn') ? 'tool' : 'news',
        name: hit.title,
        url: link,
        summary: (hit.title ?? '').slice(0, 160),
        tags: hit._tags ?? [query.label],
        score: score({ points: hit.points, mentions: hit.num_comments }),
        sources: [
          { type: 'hacker-news', url: `https://news.ycombinator.com/item?id=${hit.objectID}`, observedAt: today },
          ...(hit.url ? [{ type: 'product-page', url: hit.url, observedAt: today }] : []),
        ],
        raw: { points: hit.points ?? 0, comments: hit.num_comments ?? 0, author: hit.author ?? null, createdAt: hit.created_at },
        observedAt: today,
      });
      if (hit.created_at > newest) newest = hit.created_at;
    }
  } catch (error) {
    failures.push(`${query.label}: ${error.message}`);
  }
}

const fresh = normalizeCandidates(rows).filter(row=>!isKnown(known,row)).sort((a,b)=>b.score-a.score);
if (DRY) {
  console.log(`${fresh.length} candidates:\n${fresh.map((r) => `  ${String(r.score).padStart(4)} ${r.kind.padEnd(5)} ${r.name.slice(0, 78)}`).join('\n')}`);
} else {
  const { file, written } = writeInbox(inboxFile('hn'), fresh);
  mark(state, 'hn', newest, { candidates: written });
  saveState(state);
  console.log(`${written} new candidate(s) → ${file}`);
}
for (const failure of failures) console.error(`  warn: ${failure}`);
await recordSourceOutcome(args,'hn',fresh.length,failures);
process.exit(failures.length ? 2 : 0);
