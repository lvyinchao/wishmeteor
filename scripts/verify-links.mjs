#!/usr/bin/env node
import { parseArgs } from './lib/cli.mjs';
import { adminClient } from './lib/admin-api.mjs';
import { inspectPublicSite } from './lib/verify-public-site.mjs';
import { signedCheck } from './lib/sign-proof.mjs';
const args=parseArgs();if(args.confirm)throw new Error('manual-stamps-disabled-use-signed-verification');
const max=Number(args.max??20),age=Number(args.age??45);if(!Number.isSafeInteger(max)||max<1||max>500||!Number.isFinite(age)||age<0)throw new Error('invalid-verification-options');
const client=adminClient(args),tools=await client.catalog(),slugs=args.slugs?new Set(String(args.slugs).split(',')):null;
const queue=tools.filter(t=>t.status!=='archived'&&t.approved&&(slugs?slugs.has(t.slug):args.all||!t.lastCheckedAt||Date.now()-Date.parse(t.lastCheckedAt)>age*86400000)).sort((a,b)=>(a.lastCheckedAt??'').localeCompare(b.lastCheckedAt??'')).slice(0,max);
let failures=0;
for(const tool of queue) {
 try {const result=args.dry||!args.write?await inspectPublicSite(tool.url):await signedCheck(tool.slug,tool.url,{keyPath:args.key});if(args.write&&!args.dry)await client.request('/api/admin/content/'+tool.slug+'/verification',{verification:result});console.log(JSON.stringify({slug:tool.slug,state:result.state,httpStatus:result.httpStatus,persisted:!!args.write&&!args.dry}));}
 catch(error){failures++;console.error(tool.slug+': '+error.message);}
}
if(failures)process.exitCode=2;
