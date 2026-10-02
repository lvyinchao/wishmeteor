#!/usr/bin/env node
import { mkdirSync,writeFileSync,renameSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { parseArgs } from './lib/cli.mjs';
import { makeD1 } from './lib/d1.mjs';
const args=parseArgs(),db=makeD1({local:!!args.local,persistTo:args['persist-to'],config:args.config});
const rows=db.query('SELECT slug,content_json,updated_at FROM managed_tools ORDER BY slug');
const pending=db.query("SELECT id,name,url,created_at FROM submissions WHERE verdict='pending' ORDER BY id");
const hasAliases=db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='product_identity_aliases'").length>0;
const aliases=hasAliases?db.query('SELECT alias_key,slug,source_url,reason,created_at FROM product_identity_aliases ORDER BY alias_key'):[];
const snapshot={aliases,source:'d1',target:args.local?'local':'remote',observedAt:new Date().toISOString(),tools:rows.map(row=>({...JSON.parse(row.content_json),slug:row.slug,updatedAt:row.updated_at})),pending};
const output=resolve(String(args.output??'data/cache/catalog-snapshot.json'));mkdirSync(dirname(output),{recursive:true});const temporary=output+'.'+process.pid+'.tmp';writeFileSync(temporary,JSON.stringify(snapshot,null,2)+'\n',{mode:0o600});renameSync(temporary,output);console.log(`D1 snapshot: ${snapshot.tools.length} listings, ${pending.length} pending identities.`);
