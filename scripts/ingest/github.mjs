#!/usr/bin/env node
/**
 * GitHub: the trending page (HTML, no API, no key) plus a once-a-day search for
 * brand-new AI repositories. Findings land in data/inbox/github-<date>.jsonl; this
 * never touches src/content.
 *
 *   node scripts/ingest/github.mjs [--dry] [--lookback=14]
 */
import { request, getText } from '../lib/http.mjs';
import { parseArgs } from '../lib/cli.mjs';
import { loadState, saveState, mark, since, inboxFile, writeInbox } from '../lib/state.mjs';
import { isAiRelated, score } from '../lib/relevance.mjs';
import { knownEntries, isKnown } from '../lib/dedupe.mjs';

const args = parseArgs();
const DRY = Boolean(args.dry);
const today = new Date().toISOString().slice(0, 10);
const state = loadState();
const known = knownEntries();
const observedAt = today;

/** The trending page has no API, so parse the markup we are given. */
function parseTrending(html) {
  const rows = [];
  for (const block of html.split(/<article class="Box-row">/).slice(1)) {
    const href = /<h2 class="h3 lh-condensed">\s*<a href="\/([^"]+)"/.exec(block)?.[1];
    if (!href) continue;
    const [owner, repo] = href.split('/');
    const description = /<p class="col-9[^"]*">([\s\S]*?)<\/p>/.exec(block)?.[1]?.replace(/<[^>]+>/g, '').trim();
    const stars = Number(/stargazers[^>]*>\s*(?:<svg[\s\S]*?<\/svg>)?\s*([\d,]+)/.exec(block)?.[1]?.replace(/,/g, '') ?? 0);
    const language = /itemprop="programmingLanguage">([^<]+)</.exec(block)?.[1]?.trim();
    rows.push({ owner, repo: `${owner}/${repo}`, href, url: `https://github.com/${repo}`, description, stars, language });
  }
  return rows;
}

const collected = [];
const failures = [];

for (const window of ['daily', 'weekly']) {
  try {
    const html = await getText(`https://github.com/trending?since=${window}`);
    for (const row of parseTrending(html)) {
      if (!isAiRelated(row.repo, row.description, row.language)) continue;
      collected.push(row);
    }
  } catch (error) {
    failures.push(`trending/${window}: ${error.message}`);
  }
}

/** Search is rate-limited hard without a token, so it runs at most once per day. */
if (state.sources?.['github-search']?.lastRunAt?.slice(0, 10) !== today) {
  const lookback = Number(args.lookback ?? 14);
  const from = new Date(Date.now() - lookback * 86_400_000).toISOString().slice(0, 10);
  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(`topic:ai created:>=${from}`)}&sort=stars&order=desc&per_page=30`;
    const response = await request(url, { headers: { ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) } });
    const remaining = Number(response.headers.get('x-ratelimit-remaining') ?? '1');
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.items) {
      failures.push(`search: HTTP ${response.status}`);
    } else {
      for (const item of body.items) {
        collected.push({
          owner: item.owner.login,
          repo: item.full_name,
          url: item.html_url,
          description: item.description,
          stars: item.stargazers_count,
          language: item.language,
          search: true,
        });
      }
      mark(state, 'github-search', today, { remaining, createdSince: from });
    }
    if (remaining === 0) console.log('github search quota exhausted for this hour; the trending page still ran.');
  } catch (error) {
    failures.push(`search: ${error.message}`);
  }
} else {
  console.log('search already ran today; skipping (trending still checked).');
}

const rows = [];
for (const item of collected) {
  const key = `github:${item.repo.toLowerCase()}`;
  if (isKnown(known, { key, url: item.url, name: item.repo.split('/')[1] })) continue;
  rows.push({
    key,
    kind: 'repo',
    name: item.repo.split('/')[1],
    fullName: item.repo,
    url: item.url,
    summary: item.description?.slice(0, 160) ?? '',
    tags: [item.language, item.search ? 'new-repository' : 'trending'].filter(Boolean),
    score: score({ stars: item.stars }),
    sources: [{ type: item.search ? 'github-search' : `github-trending-${today}`, url: item.url, observedAt }],
    raw: { stars: item.stars, language: item.language ?? null },
    observedAt,
  });
}

const deduped = new Map();
for (const row of rows) if (!deduped.has(row.key)) deduped.set(row.key, row);
const fresh = [...deduped.values()].sort((a, b) => b.score - a.score);

if (DRY) {
  console.log(`${fresh.length} candidates:\n${fresh.map((r) => `  ${String(r.score).padStart(4)} ${r.key} — ${r.summary.slice(0, 70)}`).join('\n')}`);
} else {
  const { file, written } = writeInbox(inboxFile('github'), fresh);
  mark(state, 'github', today, { candidates: written });
  saveState(state);
  console.log(`${written} new candidate(s) → ${file}`);
}

for (const failure of failures) console.error(`  warn: ${failure}`);
process.exit(failures.length && !fresh.length ? 2 : 0);
