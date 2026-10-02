#!/usr/bin/env node
import { existsSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from './lib/cli.mjs';
import { adminClient } from './lib/admin-api.mjs';
import { PATHS } from '../src/lib/catalog.mjs';
import { validateTool,blessingErrors } from '../src/lib/tool-schema.ts';
import { slugify } from '../src/lib/links.mjs';
const args=parseArgs();
if(!args.submission&&!args.draft)throw new Error('usage: pnpm approve -- --submission=ID [--draft=PATH] | --draft=PATH [--slug=SLUG] [--dry] [--write] [--local]');
const client=adminClient(args);
let id=Number(args.submission),entry;
if(args.submission) {
 if(!Number.isSafeInteger(id)||id<1)throw new Error('invalid-submission-id');
 const {submissions}=await client.request('/api/admin/submissions'),row=submissions.find(row=>row.id===id);if(!row)throw new Error('submission-not-pending');
 const file=String(args.draft??join(PATHS.drafts,'blessings',id+'.json'));if(!existsSync(file))throw new Error('edited-blessing-draft-required');
 const draft=JSON.parse(readFileSync(file,'utf8'));
 entry={...draft,name:row.name,url:row.url,category:draft.category??row.category,pricing:draft.pricing??'freemium',status:draft.status??'active',origin:'submitted',approved:true,firstSeenAt:row.created_at.slice(0,10),sources:draft.sources??[{type:'submitter',url:row.url,observedAt:row.created_at.slice(0,10)}],wish:{submittedAt:row.created_at.slice(0,10),makerWish:row.make_a_wish,blessingShort:draft.blessingShort??draft.wish?.blessingShort,blessingLong:draft.blessingLong??draft.wish?.blessingLong,blessingApproved:draft.blessingApproved===true||draft.wish?.blessingApproved===true}};
} else entry=JSON.parse(readFileSync(String(args.draft),'utf8'));
const slug=String(args.slug??entry.slug??slugify(entry.name)),{value,errors}=validateTool(entry,slug);
if(args.submission)errors.push(...blessingErrors(value));if(errors.length)throw new Error(errors.join('\n'));
if(args.dry||!args.write){console.log(JSON.stringify({action:args.submission?'approve-submission':'publish-curated',submission:id||null,slug,content:value,writeRequired:!args.write},null,2));process.exit(0);}
const verification=args.proof?JSON.parse(readFileSync(String(args.proof),'utf8')):undefined;
const result=args.submission?await client.request(`/api/admin/submissions/${id}/approve`,{slug,content:value,...(verification?{verification}:{})}):await client.request('/api/admin/content/'+slug,{...value,...((entry.expectedVersion??entry.contentVersion)?{expectedVersion:entry.expectedVersion??entry.contentVersion}:{}),...(verification?{verification}:{})},'PUT');
console.log(JSON.stringify({ok:result.ok,slug:result.tool?.slug,publishedAt:result.tool?.publishedAt,notification:'transactionally queued for submissions'}));
