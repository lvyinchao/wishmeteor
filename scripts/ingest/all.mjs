#!/usr/bin/env node
/**
 * Run every collection source in order. One source failing does not stop the others:
 * the drafting job works with whatever landed.
 *
 * Exit codes: 0 everything fine, 2 at least one source found nothing usable, 3 all failed.
 *
 *   pnpm ingest
 *   pnpm ingest -- --dry
 */
import { spawnSync } from 'node:child_process';
import { parseArgs } from '../lib/cli.mjs';
import { PATHS } from '../../src/lib/catalog.mjs';

const args = parseArgs();
const passthrough = args.dry ? ['--dry'] : [];
const sources = ['github', 'hn', 'huggingface', 'vendors'];
const outcomes = [];

for (const source of sources) {
  console.log(`\n— ${source}`);
  const result = spawnSync(`node scripts/ingest/${source}.mjs ${passthrough.join(' ')}`, { shell: true, stdio: 'inherit', cwd: PATHS.root });
  outcomes.push({ source, code: result.status ?? 1 });
}

const landed = sources.filter((s) => outcomes.find((o) => o.source === s)?.code === 0);
const failed = outcomes.filter((o) => o.code !== 0);
console.log(`\n${landed.length}/${sources.length} sources reported clean.`);
for (const { source, code } of failed) console.log(`  ${source}: exit ${code}`);
if (failed.length === sources.length) process.exit(3);
process.exit(failed.length ? 2 : 0);
