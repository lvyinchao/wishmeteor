#!/usr/bin/env node
/**
 * Hugging Face: newly modified models (the public API needs no key) and the daily paper
 * feed. Findings land in data/inbox/huggingface-<date>.jsonl.
 *
 *   node scripts/ingest/huggingface.mjs [--dry] [--limit=100]
 */
import { parseArgs } from '../lib/cli.mjs';
import { getJson } from '../lib/http.mjs';
import { loadState, saveState, mark, inboxFile, writeInbox } from '../lib/state.mjs';
import { isAiRelated, score } from '../lib/relevance.mjs';

const args = parseArgs();
const DRY = Boolean(args.dry);
const LIMIT = Math.min(Number(args.limit ?? 100), 500);
const today = new Date().toISOString().slice(0, 10);
const state = loadState();
const rows = [];
const failures = [];

try {
  const models = await getJson(`https://huggingface.co/api/models?sort=lastModified&direction=-1&limit=${LIMIT}&full=true`);
  for (const model of models) {
    const tags = [...(model.tags ?? []), ...(model.cardData?.license ? [`license:${model.cardData.license}`] : [])];
    if (!isAiRelated(model.id, model.cardData?.modelId, tags.join(' '))) continue;
    const interesting = (model.downloads ?? 0) > 50 || (model.likes ?? 0) > 2 || (model.trendingScore ?? 0) > 2;
    if (!interesting) continue;
    rows.push({
      key: `hf:${model.id.toLowerCase()}`,
      kind: 'model',
      name: model.id,
      url: `https://huggingface.co/${model.id}`,
      summary: `${model.pipeline_tag ?? model.library_name ?? 'model'} release from ${model.author ?? model.id.split('/')[0]}`,
      tags: [model.pipeline_tag, model.library_name, model.cardData?.license].filter(Boolean),
      score: score({ downloads: model.downloads, likes: model.likes, mentions: model.trendingScore }),
      sources: [{ type: 'huggingface-models', url: `https://huggingface.co/${model.id}`, observedAt: today }],
      raw: { downloads: model.downloads ?? 0, likes: model.likes ?? 0, pipeline: model.pipeline_tag ?? null, license: model.cardData?.license ?? null, createdAt: model.createdAt ?? null },
      observedAt: today,
    });
  }
} catch (error) {
  failures.push(`models: ${error.message}`);
}

try {
  const papers = await getJson('https://huggingface.co/api/daily_papers?limit=30');
  for (const item of papers) {
    const paper = item.paper ?? item;
    if (!paper.id || !paper.title) continue;
    if (!isAiRelated(paper.title, paper.summary)) continue;
    rows.push({
      key: `paper:${paper.id}`,
      kind: 'news',
      name: paper.title,
      url: `https://huggingface.co/papers/${paper.id}`,
      summary: String(paper.summary ?? '').replace(/\s+/g, ' ').slice(0, 160),
      tags: ['paper', ...(paper.paperTags ?? []).slice(0, 3)],
      score: score({ upvotes: paper.upvotes, mentions: paper.upvotes }),
      sources: [
        { type: 'huggingface-daily-papers', url: `https://huggingface.co/papers/${paper.id}`, observedAt: today },
        ...(paper.id ? [{ type: 'arxiv', url: `https://arxiv.org/abs/${paper.id}`, observedAt: today }] : []),
      ],
      raw: { upvotes: paper.upvotes ?? 0, publishedAt: paper.publishedAt ?? null },
      observedAt: today,
    });
  }
} catch (error) {
  failures.push(`daily_papers: ${error.message}`);
}

const fresh = rows.sort((a, b) => b.score - a.score);
if (DRY) {
  console.log(`${fresh.length} candidates:\n${fresh.map((r) => `  ${String(r.score).padStart(4)} ${r.kind.padEnd(6)} ${r.name.slice(0, 74)}`).join('\n')}`);
} else {
  const { file, written } = writeInbox(inboxFile('huggingface'), fresh);
  mark(state, 'huggingface', today, { candidates: written });
  saveState(state);
  console.log(`${written} new candidate(s) → ${file}`);
}
for (const failure of failures) console.error(`  warn: ${failure}`);
process.exit(failures.length && !fresh.length ? 2 : 0);
