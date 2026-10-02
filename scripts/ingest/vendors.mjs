#!/usr/bin/env node
/**
 * Vendor changelogs: RSS feeds where they exist, HTML link extraction where they do not.
 * Conditional GETs mean an unchanged feed costs almost nothing. Findings land in
 * data/inbox/vendors-<date>.jsonl.
 *
 *   node scripts/ingest/vendors.mjs [--dry] [--force]
 */
import { parseArgs } from '../lib/cli.mjs';
import { recordSourceOutcome,normalizeCandidates } from '../lib/source-outcome.mjs';
import { getConditional, getText } from '../lib/http.mjs';
import { loadState, saveState, mark, inboxFile, writeInbox, loadValidators, saveValidators } from '../lib/state.mjs';
import { isAiRelated, score } from '../lib/relevance.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS } from '../../src/lib/catalog.mjs';

import { knownEntries,isKnown } from '../lib/dedupe.mjs';
const known=knownEntries();
const args = parseArgs();
const DRY = Boolean(args.dry);
const today = new Date().toISOString().slice(0, 10);
const state = loadState();
const validators = loadValidators();
const sources = JSON.parse(readFileSync(join(PATHS.root, 'scripts/sources.json'), 'utf8'));
const rows = [];
const failures = [];

const decode = (text) =>
  String(text)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function parseRss(xml, sourceName, origin) {
  const items = [];
  for (const block of xml.split(/<item[\s>]/).slice(1)) {
    const chunk = block.split('</item>')[0];
    const tag = (name) => decode(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i').exec(chunk)?.[1] ?? '');
    const title = tag('title');
    const link = tag('link') || (new RegExp('<a[^>]+href="([^"]+)"', 'i').exec(chunk)?.[1] ?? '');
    if (!title || !link) continue;
    items.push({ title, link: new URL(link, origin).href, published: tag('pubDate') || tag('dc:date'), summary: tag('description').slice(0, 180), sourceName });
  }
  return items;
}

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
const DATE_IN_TEXT = new RegExp(`((?:${MONTHS})[a-z]*\\.?\\s+\\d{1,2},?\\s+\\d{4})`, 'i');
const MAX_AGE_DAYS = Number(args['lookback-days'] ?? 150);

function parseHtmlLinks(html, source) {
  const pattern = source.match ? new RegExp(source.match.replace(/^\/|\/$/g, '')) : /news|blog|research/;
  const found = [];
  for (const match of html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1];
    const raw = decode(match[2]);
    if (!pattern.test(href)) continue;
    if (!raw || raw.length < 12 || raw.length > 140) continue;
    const stamp = DATE_IN_TEXT.exec(raw)?.[1];
    const title = stamp ? raw.replace(stamp, '').trim() : raw;
    let published = '';
    if (stamp) {
      const parsed = Date.parse(stamp.replace(/,/g, ''));
      if (Number.isNaN(parsed)) continue;
      if (Date.now() - parsed > MAX_AGE_DAYS * 86_400_000) continue;
      published = new Date(parsed).toISOString().slice(0, 10);
    }
    found.push({ title, link: new URL(href, source.url).href, published, summary: '', sourceName: source.name });
  }
  const seen = new Set();
  return found.filter((item) => (seen.has(item.link) ? false : seen.add(item.link)));
}

for (const source of sources) {
  try {
    if (source.kind === 'rss') {
      const result = await getConditional(source.url, validators[source.url], { timeout: 20_000 });
      if (result.error) {
        failures.push(`${source.name}: ${result.error}`);
        continue;
      }
      if (!result.changed) {
        console.log(`unchanged: ${source.name}`);
        continue;
      }
      validators[source.url] = result.validator;
      const parsed=parseRss(result.text, source.name, source.url);if(!parsed.length)throw new Error('rss-parser-returned-zero-items');
      for (const item of parsed) rows.push(item);
    } else {
      const html = await getText(source.url, { timeout: 20_000 });
      const parsed=parseHtmlLinks(html,source);if(!parsed.length)throw new Error('html-parser-returned-zero-items');
      for (const item of parsed) rows.push(item);
    }
  } catch (error) {
    failures.push(`${source.name}: ${error.message.slice(0, 80)}`);
  }
}

const fresh = [];
for (const item of rows) {
  if (!isAiRelated(item.title, item.summary, item.link)) continue;
  const key = `vendor:${new URL(item.link).hostname}:${item.link.replace(/^https?:\/\/(www\.)?/, '')}`;
  fresh.push({
    key,
    kind: 'news',
    name: item.title,
    url: item.link,
    summary: (item.summary || item.title).slice(0, 160),
    tags: ['announcement', item.sourceName?.toLowerCase().replace(/\s+/g, '-')].filter(Boolean),
    score: score({ mentions: 3 }),
    sources: [{ type: 'vendor-changelog', url: item.link, observedAt: today }],
    raw: { published: item.published || null, vendor: item.sourceName },
    observedAt: today,
  });
}

const unique = [...new Map(normalizeCandidates(fresh).filter(row=>!isKnown(known,row)).map(row=>[row.key,row])).values()];
if (DRY) {
  console.log(`${unique.length} candidates:\n${unique.map((r) => `  ${r.name.slice(0, 84)}`).join('\n')}`);
} else {
  const { file, written } = writeInbox(inboxFile('vendors'), unique);
  mark(state, 'vendors', today, { candidates: written, feeds: sources.length });
  saveState(state);
  saveValidators(validators);
  console.log(`${written} new candidate(s) → ${file}`);
}
for (const failure of failures) console.error(`  warn: ${failure}`);
await recordSourceOutcome(args,'vendors',unique.length,failures);
process.exit(failures.length ? 2 : 0);
