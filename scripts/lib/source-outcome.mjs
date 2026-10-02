import { canonicalProductUrl } from '../../src/lib/tool-schema.ts';
import { mkdirSync,appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS } from '../../src/lib/catalog.mjs';
import { adminClient } from './admin-api.mjs';
export async function recordSourceOutcome(args,source,candidates,failures) {
 const state=failures.length?(candidates?'partial':'failed'):'succeeded';
 const record={source,state,candidates,detail:failures.map(item=>String(item).replace(/https?:\/\/\S+/g,'[source-url]')).join(' | ').slice(0,1000),observedAt:new Date().toISOString()};
 if(!args.dry){mkdirSync(PATHS.cache,{recursive:true});appendFileSync(join(PATHS.cache,'source-runs.jsonl'),JSON.stringify(record)+'\n',{mode:0o600});if(args.write)await adminClient(args).request('/api/admin/source-runs',record);}
 console.log(JSON.stringify({source,state,candidates,failures:failures.length}));return state;
}

export function normalizeCandidates(rows) {
 return rows.flatMap(row=>{const target=canonicalProductUrl(row.url);return target?[{...row,url:target.url,rootDomain:target.domain,projectKey:target.projectKey,collectedAt:new Date().toISOString()}]:[];});
}
