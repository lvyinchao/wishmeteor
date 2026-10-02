import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from './cli.mjs';
import { canonicalizeUrl, domainKey, slugify } from '../../src/lib/links.mjs';

/**
 * What is already in the index, in the three forms a candidate can arrive as:
 * a source-native key (github:owner/repo, hf:model-id), a domain hash, or a slug.
 */
export function knownEntries() {
  const args=parseArgs();
  const snapshotFile=resolve(String(args.snapshot ?? process.env.WISHMETEOR_SNAPSHOT ?? 'data/cache/catalog-snapshot.json'));
  const snapshot=JSON.parse(readFileSync(snapshotFile,'utf8'));
  if(snapshot.source!=='d1'||!Array.isArray(snapshot.tools)||!Number.isFinite(Date.parse(snapshot.observedAt))||(!args['allow-stale-snapshot']&&Date.now()-Date.parse(snapshot.observedAt)>3600000))throw new Error('fresh-d1-snapshot-required');
  const tools=[...snapshot.tools,...(snapshot.pending ?? []).map(row=>({...row,slug:'pending-'+row.id,sources:[]}))];
  const keys = new Set();
  const domains = new Set();
  const projects=new Set(),urls=new Set();
  const slugs = new Set();
  const names = new Set();
  for (const entry of tools) {
    slugs.add(entry.slug);
    names.add(normaliseName(entry.name));
    const canonical = canonicalizeUrl(entry.url);
    if (canonical) {domains.add(domainKey(canonical.domain));projects.add(canonical.projectKey);urls.add(canonical.url);}
    for (const source of entry.sources ?? []) {
      const repo = /github\.com\/([^/]+\/[^/]+)/.exec(source.url);
      if (repo) keys.add(`github:${repo[1].toLowerCase()}`);
      const hub = /huggingface\.co\/(?:models\/)?([^/]+\/[^/]+)/.exec(source.url);
      if (hub) keys.add(`hf:${hub[1].toLowerCase()}`);
    }
    const repoUrl = /github\.com\/([^/]+\/[^/]+)/.exec(entry.url);
    if (repoUrl) keys.add(`github:${repoUrl[1].toLowerCase()}`);
  }
  for(const alias of snapshot.aliases ?? []){const target=canonicalizeUrl(alias.source_url);if(target){projects.add(target.projectKey);urls.add(target.url);}}
  return { keys, domains, projects, urls, slugs, names, tools };
}

const normaliseName = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '');

/** @param {ReturnType<typeof knownEntries>} known */
export function isKnown(known, candidate) {
  if (candidate.key && known.keys.has(candidate.key)) return 'key';
  const canonical = canonicalizeUrl(candidate.url);
  if (!canonical) return 'invalid-url';
  if(known.urls.has(canonical.url))return 'url';
  if(candidate.kind!=='news'&&known.projects.has(canonical.projectKey))return 'project';
  if (candidate.kind!=='news'&&known.names.has(normaliseName(candidate.name))) return 'name';
  return null;
}

/** Warning only: near-miss names that a human should eyeball before publishing. */
export function fuzzyNeighbours(known, name, limit = 3) {
  const target = normaliseName(name);
  if (target.length < 4) return [];
  return [...known.tools]
    .map((entry) => ({ entry, score: commonPrefix(target, normaliseName(entry.name)) }))
    .filter((item) => item.score >= Math.min(5, target.length - 1) && item.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => entry.slug);
}

const commonPrefix = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
};

/** A slug that will not collide with an existing entry. */
export function reserveSlug(known, name) {
  const base = slugify(name) || 'wish';
  if (!known.slugs.has(base)) {
    known.slugs.add(base);
    return base;
  }
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}-${n}`;
    if (!known.slugs.has(candidate)) {
      known.slugs.add(candidate);
      return candidate;
    }
  }
  return `${base}-${Date.now()}`;
}
