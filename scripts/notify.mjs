#!/usr/bin/env node
import { parseArgs } from './lib/cli.mjs';
import { adminClient } from './lib/admin-api.mjs';
const args=parseArgs(),client=adminClient(args);
const {notifications}=await client.request('/api/admin/outbox');
console.log(JSON.stringify(notifications.map(({id,kind,state,attempts,accepted_at,message_id,last_error})=>({id,kind,state,attempts,accepted_at,message_id,last_error})),null,2));
if(args.dry||!args.write){console.log('Read only. Use --write to dispatch eligible queued service notifications.');process.exit(0);}
if(args.retry)await client.request('/api/admin/outbox/retry',{id:String(args.retry)});
const result=await client.request('/api/admin/outbox/dispatch',{});
console.log(JSON.stringify({...result,evidence:'Provider acceptance only; inbox delivery is separate.'}));
