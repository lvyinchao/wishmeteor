import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,writeFileSync,mkdirSync } from 'node:fs';
import { tmpdir,hostname } from 'node:os';
import { join } from 'node:path';
import { environment,auth,verificationToken } from './harness.mjs';
import { tool,store,call,admin,pending,approvedContent } from './fixtures.mjs';
import { enqueueStatement,dispatchOutbox,cleanupState } from '../worker/outbox.ts';
import { CatalogRepository } from '../worker/catalog.ts';
import { buildBackfillPlan,toolUpdateSql,validatePlan } from '../scripts/lib/backfill.mjs';
import { validateManifest,acquireLock,command,assertStaging,sourceFingerprint } from '../scripts/lib/release.mjs';
import { makeD1 } from '../scripts/lib/d1.mjs';
import { inspectPublicSite,publicAddress,pinnedRequest } from '../scripts/lib/verify-public-site.mjs';
import { normalizeCandidates } from '../scripts/lib/source-outcome.mjs';
async function owner(env){const email='isolated@example.com',password='isolated-owner-password';await auth(env,'/api/auth/register',{email,password});await auth(env,'/api/auth/verify?token='+verificationToken(env,email));const login=await auth(env,'/api/auth/login',{email,password});return login.headers.get('set-cookie').split(';')[0];}
const payload={subject:'Isolated notification',text:'Isolated message',html:'<p>Isolated message</p>'};
test('outbox retries with backoff, permanent failures and explicit manual retry',async()=>{
 const env=environment(),now=Date.now();await enqueueStatement(env.DB,'event','receipt','isolated@example.com',payload,null,new Date(now).toISOString()).run();env.EMAIL={async send(){throw Object.assign(new Error('private message'),{code:'TEMPORARY'});}};
 assert.equal((await dispatchOutbox(env,20,now)).failed,1);let row=env.DB.sqlite.prepare('SELECT * FROM notification_outbox').get();assert.equal(row.state,'queued');assert.equal(row.attempts,1);assert.equal(row.last_error,'TEMPORARY');assert.equal((await dispatchOutbox(env,20,now+1000)).failed,0);
 env.EMAIL={async send(){throw Object.assign(new Error('invalid'),{code:'RECIPIENT_INVALID'});}};await dispatchOutbox(env,20,now+130000);row=env.DB.sqlite.prepare('SELECT * FROM notification_outbox').get();assert.equal(row.state,'failed');env.EMAIL=undefined;assert.equal((await admin(env,'/api/admin/outbox/retry',{id:'event'})).status,200);assert.equal(env.DB.sqlite.prepare('SELECT attempts FROM notification_outbox').get().attempts,0);
});
test('outbox leases prevent parallel send and expired final leases are cleaned',async()=>{
 const env=environment(),now=Date.now();await enqueueStatement(env.DB,'event','support','isolated@example.com',payload,null,new Date(now).toISOString()).run();let sends=0;env.EMAIL={async send(){sends++;assert.equal((await dispatchOutbox(env,20,now)).accepted,0);return {messageId:'one-message'};}};assert.equal((await dispatchOutbox(env,20,now)).accepted,1);assert.equal(sends,1);
 env.DB.sqlite.prepare("UPDATE notification_outbox SET state='processing',attempts=6,lease_until=?").run(new Date(now-1).toISOString());await cleanupState(env.DB,new Date(now));assert.equal(env.DB.sqlite.prepare('SELECT state FROM notification_outbox').get().state,'failed');
});
test('expired tokens and removed followers cancel queued notifications',async()=>{
 const env=environment();await enqueueStatement(env.DB,'token','verify','isolated@example.com',{...payload,tokenHash:'nonexistent'}).run();await enqueueStatement(env.DB,'follow','product-update','isolated@example.com',{...payload,slug:'missing',accountId:'missing'}).run();assert.equal((await dispatchOutbox(env)).cancelled,2);assert.equal(env.mail.length,0);
});
test('admin cookies require same origin, expire and revoke when the credential rotates',async()=>{
 const env=environment();env.EMAIL=undefined;const session=await call(env,'/api/admin/session',{token:env.ADMIN_API_TOKEN});assert.equal(session.status,200);const cookie=session.headers.get('set-cookie').split(';')[0];assert.equal((await call(env,'/api/admin/metrics',undefined,{cookie})).status,200);
 assert.equal((await call(env,'/api/admin/outbox/retry',{id:'x'},{cookie,headers:{origin:'https://foreign.example'}})).status,403);env.ADMIN_API_TOKEN='rotated-secret';assert.equal((await call(env,'/api/admin/metrics',undefined,{cookie})).status,401);
});
test('manual identity aliases reject pending conflicts and survive a homepage change',async()=>{
 const env=environment();env.EMAIL=undefined;const value=tool();store(env,value);const reason='Manually checked that this repository belongs to this official product.';
 assert.equal((await admin(env,'/api/admin/content/'+value.slug+'/aliases',{url:'https://github.com/isolated/real-project',reason})).status,201);assert.ok(await new CatalogRepository(env.DB).duplicate('github.com:isolated/real-project'));
 pending(env,2);assert.equal((await admin(env,'/api/admin/content/'+value.slug+'/aliases',{url:'https://project-2.com',reason})).status,409);
 assert.equal((await admin(env,'/api/admin/content/'+value.slug,{...value,url:'https://moved-project.com',expectedVersion:value.contentVersion},{method:'PUT'})).status,200);assert.ok(await new CatalogRepository(env.DB).duplicate('isolated-project.com'));
 assert.equal((await call(env,'/api/submit',{name:'Duplicate',url:value.url,email:'maker@example.com',own:'yes'})).status,409);
});
test('pending edits update queued mail atomically and avoid an in-flight receipt',async()=>{
 const env=environment();env.EMAIL=undefined;const cookie=await owner(env),input={name:'Original',url:'https://original-project.com',email:'maker@example.com',category:'ai-coding',notes:'The original description.',makeAWish:'A useful wish.',own:'yes'};
 const id=(await (await call(env,'/api/submit',input,{cookie})).json()).id;assert.equal((await call(env,'/api/account/submissions/'+id,{...input,name:'Changed',email:'changed@example.com'},{cookie,method:'PATCH'})).status,200);
 const receipt=env.DB.sqlite.prepare("SELECT * FROM notification_outbox WHERE kind='receipt' AND submission_id=?").get(id);assert.equal(receipt.recipient,'changed@example.com');assert.match(receipt.payload_json,/Changed/);
 env.DB.sqlite.prepare("UPDATE notification_outbox SET state='processing' WHERE id=?").run(receipt.id);assert.equal((await call(env,'/api/account/submissions/'+id,{...input,name:'Not saved'},{cookie,method:'PATCH'})).status,409);assert.equal(env.DB.sqlite.prepare('SELECT name FROM submissions WHERE id=?').get(id).name,'Changed');
});
test('backfill statements are guarded, complete, idempotent and preserve source dates',()=>{
 const env=environment();store(env,tool('backfill-one'));store(env,tool('backfill-two'));const rows=env.DB.sqlite.prepare('SELECT slug,content_json,created_at,updated_at FROM managed_tools ORDER BY slug').all();const plan=buildBackfillPlan(rows,[]);assert.equal(validatePlan(plan).tools.length,2);assert.throws(()=>validatePlan({...plan,target:'remote'}));
 const changed=plan.tools.map(item=>({...item,json:JSON.stringify({...item.value,summary:item.value.summary+' Checked.'})}));env.DB.sqlite.exec(toolUpdateSql(changed));assert.equal(env.DB.sqlite.prepare('SELECT changes() AS n').get().n,2);env.DB.sqlite.exec(toolUpdateSql(changed));assert.equal(env.DB.sqlite.prepare('SELECT changes() AS n').get().n,0);
 const stale=buildBackfillPlan(env.DB.sqlite.prepare('SELECT slug,content_json,created_at,updated_at FROM managed_tools ORDER BY slug').all(),[]).tools;env.DB.sqlite.prepare("UPDATE managed_tools SET content_json=json_set(content_json,'$.summary','Concurrent edit') WHERE slug='backfill-two'").run();env.DB.sqlite.exec(toolUpdateSql(stale));assert.equal(env.DB.sqlite.prepare('SELECT changes() AS n').get().n,0);
});
test('release manifest denies private paths, commands use argument arrays and locks respect owners',()=>{
 const manifest={version:1,files:['worker/index.ts','migrations/1001_submissions.sql'],migrations:['migrations/1001_submissions.sql']};assert.equal(validateManifest(manifest).files.length,2);
 for(const file of ['data/cache/private.json','../secret','worker/private.pem','.env','scripts/token.json','-x'])assert.throws(()=>validateManifest({...manifest,files:[file],migrations:[]}));
 const root=mkdtempSync(join(tmpdir(),'wm-release-'));try{const unlock=acquireLock(root);assert.throws(()=>acquireLock(root,{recover:true}));unlock();const dead=acquireLock(root,{pid:999999});const recovered=acquireLock(root,{recover:true,alive:()=>false});dead();assert.throws(()=>acquireLock(root));recovered();}finally{rmSync(root,{recursive:true,force:true});}
 const value='literal $(do-not-execute) `anything`';let observed;assert.equal(command('.', 'git',['commit','-m',value],{capture:true,runner:(p,args)=>{observed=args;return {status:0,stdout:'ok'};}}),'ok');assert.equal(observed[2],value);assert.throws(()=>assertStaging('.',manifest,()=>'.env\0'));
});
test('D1 client is read only by default, binds safely and exposes failures',()=>{
 let arguments_;const db=makeD1({local:true,config:'isolated.json',runner:(_p,args)=>{arguments_=args;return {status:0,stdout:'[{"success":true,"results":[]}]'};}});db.query("SELECT '?' AS constant, ? AS value","a'b");assert.ok(arguments_.includes("SELECT '?' AS constant, 'a''b' AS value"));assert.ok(arguments_.includes('isolated.json'));assert.throws(()=>db.run('DELETE FROM accounts'));assert.throws(()=>makeD1({runner:()=>({status:1})}).query('SELECT 1'));assert.throws(()=>db.query('SELECT ?',1,2));
});
test('verification rejects unsafe DNS and redirects, accepts HTML only and records failures',async()=>{
 for(const ip of ['127.0.0.1','10.0.0.2','192.168.1.1','169.254.169.254','::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(publicAddress(ip),false);assert.equal(publicAddress('8.8.8.8'),true);
 await assert.rejects(()=>pinnedRequest(new URL('https://example.com'),'HEAD',new AbortController().signal,async()=>[{address:'127.0.0.1',family:4}],()=>{throw Error('must not connect');}),/unsafe-dns/);
 assert.equal((await inspectPublicSite('https://example.com',async()=>({status:302,location:'http://127.0.0.1',contentType:''}))).state,'blocked');assert.equal((await inspectPublicSite('https://example.com',async()=>({status:200,contentType:'image/png'}))).state,'blocked');assert.equal((await inspectPublicSite('https://example.com',async()=>({status:404,contentType:'text/html'}))).state,'dead');let methods=[];assert.equal((await inspectPublicSite('https://example.com',async(_u,m)=>{methods.push(m);return m==='HEAD'?{status:405}:{status:200,contentType:'text/html; charset=utf-8'};})).state,'live');assert.deepEqual(methods,['HEAD','GET']);
});
test('source candidates have project identity and observation timestamps',()=>{
 const candidates=normalizeCandidates([{name:'Repo A',url:'https://github.com/isolated/project-a'},{name:'Repo B',url:'https://github.com/isolated/project-b'},{url:'http://localhost/private'}]);assert.equal(candidates.length,2);assert.notEqual(candidates[0].projectKey,candidates[1].projectKey);assert.ok(candidates.every(c=>Number.isFinite(Date.parse(c.collectedAt))));
});

import { parseTrending } from '../scripts/lib/github-trending.mjs';
test('GitHub trending parser handles attributes preceding repository href',()=>{
 const html='<article class="Box-row other"><h2 class="h3 lh-condensed"><a data-hydro-click="payload" class="Link" href="/isolated/project-ai">AI project</a></h2><p class="col-9 color-fg-muted">AI tooling</p></article>';
 const rows=parseTrending(html);assert.equal(rows.length,1);assert.equal(rows[0].repo,'isolated/project-ai');assert.equal(rows[0].url,'https://github.com/isolated/project-ai');
});

import { challengeConfigured,verifyChallenge } from '../worker/challenge.ts';
import { request } from './harness.mjs';
test('optional star challenge is triggered only after abnormal issuance and verifies hostname/action',async()=>{
 const env=environment();env.EMAIL=undefined;env.TURNSTILE_SITE_KEY='isolated-site-key';env.TURNSTILE_SECRET='isolated-secret';env.TURNSTILE_HOSTNAMES='wishmeteor.net';
 for(let i=0;i<10;i++)assert.equal((await call(env,'/api/stars/identity',{})).status,200);
 const challenge=await call(env,'/api/stars/identity',{});assert.equal((await challenge.json()).error,'challenge-required');
 const original=globalThis.fetch;try{globalThis.fetch=async()=>Response.json({success:true,action:'wrong',hostname:'wishmeteor.net'});assert.equal(await verifyChallenge(request('/api/stars/identity',{}),env,'isolated'),false);
 globalThis.fetch=async()=>Response.json({success:true,action:'star_identity',hostname:'localhost'});assert.equal(await verifyChallenge(request('/api/stars/identity',{}),env,'isolated'),false);
 globalThis.fetch=async()=>Response.json({success:true,action:'star_identity',hostname:'wishmeteor.net'});assert.equal((await call(env,'/api/stars/identity',{challengeToken:'isolated'})).status,200);
 }finally{globalThis.fetch=original;}env.TURNSTILE_HOSTNAMES='wishmeteor.net,localhost';assert.equal(challengeConfigured(env),false);
});

test('an unsent approval message uses the current blessing and card version',async()=>{
 const env=environment();env.EMAIL=undefined;const id=pending(env,1),content=approvedContent(1);assert.equal((await admin(env,`/api/admin/submissions/${id}/approve`,{slug:content.slug,content})).status,200);
 const current=await new CatalogRepository(env.DB).get(content.slug);const blessing='May this updated and reviewed blessing stay together with its matching card. May the next step bring thoughtful feedback, patient collaborators and a useful path forward for everyone this project helps.';
 assert.equal((await admin(env,'/api/admin/content/'+content.slug,{...current,wish:{...current.wish,blessingLong:blessing},expectedVersion:current.contentVersion},{method:'PUT'})).status,200);
 const latest=await new CatalogRepository(env.DB).get(content.slug);env.EMAIL={async send(message){env.mail.push(message);return {messageId:'accepted-current-version'};}};await dispatchOutbox(env);assert.match(env.mail[0].text,new RegExp(blessing.slice(0,60)));assert.ok(env.mail[0].text.includes(latest.contentVersion));
});

test('release source fingerprints detect changes to already modified source files',()=>{
 const root=mkdtempSync(join(tmpdir(),'wm-fingerprint-'));try{mkdirSync(join(root,'public'));const file=join(root,'public/site.js');writeFileSync(file,'before');const manifest={files:['public/site.js']};const run=()=> 'already modified';const before=sourceFingerprint(root,manifest,run);writeFileSync(file,'after');assert.notEqual(sourceFingerprint(root,manifest,run),before);}finally{rmSync(root,{recursive:true,force:true});}
});
