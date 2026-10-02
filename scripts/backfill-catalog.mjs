#!/usr/bin/env node
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { parseArgs } from './lib/cli.mjs';
import { makeD1 } from './lib/d1.mjs';
import { buildBackfillPlan,validatePlan,toolUpdateSql,literal } from './lib/backfill.mjs';
const args=parseArgs(),local=!!args.local,db=makeD1({local,writable:!!args.write,persistTo:args['persist-to'],config:args.config});
if(!args.apply) {
 const rows=db.query('SELECT slug,content_json,created_at,updated_at FROM managed_tools ORDER BY slug'),submissions=db.query('SELECT id,url,created_at,verdict,verdict_at FROM submissions ORDER BY id');
 const plan=buildBackfillPlan(rows,submissions,{target:local?'local':'remote'}),output=resolve(String(args.output??'data/cache/backfill-plan.json'));mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(plan,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({action:'planned',tools:plan.tools.length,pending:plan.pending.length,sha256:plan.sha256,target:plan.target,output}));process.exit(0);
}
if(!args.write)throw new Error('backfill-apply-requires-write');
const plan=validatePlan(JSON.parse(readFileSync(String(args.apply),'utf8')));if(plan.target!==(local?'local':'remote'))throw new Error('backfill-target-mismatch');
const current=db.query('SELECT slug,content_json,root_domain,dedupe_key,updated_at FROM managed_tools ORDER BY slug'),bySlug=new Map(current.map(row=>[row.slug,row]));
for(const item of plan.tools){const row=bySlug.get(item.slug);if(!row||(row.content_json!==item.expectedJson&&row.content_json!==item.json)||row.updated_at!==item.expectedUpdatedAt)throw new Error('catalog-changed-regenerate-plan:'+item.slug);}
const work=plan.tools.filter(item=>bySlug.get(item.slug).content_json!==item.json||bySlug.get(item.slug).dedupe_key!==item.projectKey);
// Each <=80KB SQL statement updates its complete chunk or nothing. A resumed
// run skips already-applied chunks after checking their exact planned content.
let chunk=[];for(const item of work){const next=[...chunk,item];if(toolUpdateSql(next).length>80_000&&chunk.length){db.run(toolUpdateSql(chunk));chunk=[];}chunk.push(item);}if(chunk.length)db.run(toolUpdateSql(chunk));
const metadata=[];
for(const item of plan.pending)metadata.push(`UPDATE submissions SET root_domain=${literal(item.rootDomain)},dedupe_key=${literal(item.projectKey)} WHERE id=${item.id} AND verdict='pending' AND url=${literal(item.expectedUrl)}`);
for(const item of plan.tools) {
 if(item.approvedSubmissionId)metadata.push(`UPDATE submissions SET approved_slug=${literal(item.slug)} WHERE id=${item.approvedSubmissionId} AND verdict='approved'`);
 metadata.push(`INSERT OR IGNORE INTO tool_cards(slug,version,card_json,created_at) SELECT slug,json_extract(content_json,'$.contentVersion'),content_json,updated_at FROM managed_tools WHERE slug=${literal(item.slug)} AND content_json=${literal(item.json)}`);
 if(item.public)metadata.push(`INSERT INTO tool_events(slug,kind,name,summary,category,created_at) SELECT slug,'published',json_extract(content_json,'$.name'),json_extract(content_json,'$.summary'),category,published_at FROM managed_tools WHERE slug=${literal(item.slug)} AND content_json=${literal(item.json)} AND NOT EXISTS(SELECT 1 FROM tool_events WHERE slug=${literal(item.slug)})`);
}
let statements=[];let size=0;for(const statement of metadata){if(size+statement.length>80_000&&statements.length){db.run(statements.join(';\n'));statements=[];size=0;}statements.push(statement);size+=statement.length+2;}if(statements.length)db.run(statements.join(';\n'));
const finalRows=new Map(db.query('SELECT slug,content_json,root_domain,dedupe_key FROM managed_tools').map(row=>[row.slug,row]));
for(const item of plan.tools){const row=finalRows.get(item.slug);if(!row||row.content_json!==item.json||row.dedupe_key!==item.projectKey||row.root_domain!==item.rootDomain)throw new Error('backfill-concurrent-change-regenerate-plan:'+item.slug);}
const unmatched=db.query("SELECT slug FROM managed_tools WHERE dedupe_key='' OR root_domain='' OR json_extract(content_json,'$.contentVersion') IS NULL");if(unmatched.length)throw new Error('backfill-incomplete-regenerate-plan');
console.log(JSON.stringify({action:'applied',tools:work.length,total:plan.tools.length,pending:plan.pending.length,sha256:plan.sha256,target:plan.target}));
