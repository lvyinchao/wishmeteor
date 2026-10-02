#!/usr/bin/env node
import { parseArgs } from './lib/cli.mjs';
import { adminClient } from './lib/admin-api.mjs';
const args=parseArgs(),client=adminClient(args);
if(args.reject){for(const raw of String(args.reject).split(',')){const id=Number(raw);if(!Number.isSafeInteger(id)||id<1)throw new Error('invalid-submission-id');if(args.dry||!args.write){console.log('Would reject submission '+id);continue;}await client.request(`/api/admin/submissions/${id}/reject`,{});console.log(`Submission ${id} rejected; service notification queued.`);}process.exit(0);}
const {submissions}=await client.request('/api/admin/submissions');
const rows=args.show?submissions.filter(row=>row.id===Number(args.show)):submissions;
console.log(JSON.stringify(rows,null,2));
