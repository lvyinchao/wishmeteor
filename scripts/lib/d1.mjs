import { spawnSync } from 'node:child_process';
import { PATHS } from '../../src/lib/catalog.mjs';
/** Wrangler authentication stays in its own process. Remote calls default to read only. */
export function makeD1({local=false,writable=false,persistTo,config,runner=spawnSync}={}) {
 function run(statement) {
  if(!writable&&!/^\s*(?:SELECT|EXPLAIN\s+QUERY\s+PLAN)\b/i.test(statement))throw new Error('d1-read-only');
  const args=['exec','wrangler','d1','execute','wishmeteor',local?'--local':'--remote','--json','--command',statement];if(persistTo)args.push('--persist-to',persistTo);if(config)args.push('--config',config);
  const result=runner('pnpm',args,{encoding:'utf8',maxBuffer:64*1024*1024,cwd:PATHS.root});
  if(result.status!==0)throw new Error('d1-execute-failed-exit-'+(result.status??'unknown'));
  const raw=result.stdout.trim(),start=raw.indexOf('[');if(start<0)throw new Error('d1-invalid-response');
  const parsed=JSON.parse(raw.slice(start));if(!Array.isArray(parsed)||!parsed.length||parsed.some(item=>item.success===false||!Array.isArray(item.results)))throw new Error('d1-query-failed');return parsed[0].results;
 }
 function query(sql,...values) {
  let index=0;const escaped=sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g,token=>{if(token!=='?')return token;if(index>=values.length)throw new Error('d1-parameter-count');const value=values[index++];if(value==null)return 'NULL';if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('invalid-number');return String(value);}if(typeof value!=='string')throw new Error('invalid-sql-value');return "'"+value.replaceAll("'","''")+"'";});
  if(index!==values.length)throw new Error('d1-parameter-count');return run(escaped);
 }
 return {run,query};
}
