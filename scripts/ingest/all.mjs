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
const passthrough=process.argv.slice(2).filter(value=>value!=='--snapshot-only');
const sources=['github','hn','huggingface','vendors'],outcomes=[];
const snapshot=String(args.snapshot ?? 'data/cache/catalog-snapshot.json');
const refreshed=spawnSync(process.execPath,['scripts/snapshot-catalog.mjs','--output='+snapshot,...(args.local?['--local']:[]),...(args.config?['--config='+args.config]:[]),...(args['persist-to']?['--persist-to='+args['persist-to']]:[])],{stdio:'inherit',cwd:PATHS.root});
if(refreshed.status!==0)throw new Error('d1-snapshot-refresh-failed');
if(args['snapshot-only'])process.exit(0);
for(const source of sources) {
 const result=spawnSync(process.execPath,['scripts/ingest/'+source+'.mjs',...passthrough,'--snapshot='+snapshot],{stdio:'inherit',cwd:PATHS.root});outcomes.push({source,code:result.status ?? 1});
}
console.log(JSON.stringify({sources:outcomes}));const failed=outcomes.filter(row=>row.code!==0).length;process.exit(failed===sources.length?3:failed?2:0);
