import test from 'node:test';
import assert from 'node:assert/strict';
import { environment,request,auth,verificationToken } from './harness.mjs';
import { tool,store,call,admin,pending,approvedContent } from './fixtures.mjs';
import { CatalogRepository } from '../worker/catalog.ts';
import { isDofollow,outboundRel } from '../src/lib/link-policy.ts';
import { canonicalProductUrl,validateTool } from '../src/lib/tool-schema.ts';
import { dispatchOutbox } from '../worker/outbox.ts';
import { cardSvg } from '../worker/cards.ts';
import { verificationMessage } from '../src/lib/verification.mjs';
import { publicHeader,publicFooter } from '../src/lib/public-shell.ts';

const silent=()=>{const env=environment();env.EMAIL=undefined;return env;};
async function sign(env,slug,url,state='live',extra={}) {
 const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);env.LINK_VERIFIER_PUBLIC_KEY=Buffer.from(await crypto.subtle.exportKey('spki',pair.publicKey)).toString('base64');
 const checkedAt=Date.now()-1000,p={slug,url,state,httpStatus:state==='live'?200:state==='dead'?404:403,checkedAt,expiresAt:checkedAt+600000,nonce:crypto.randomUUID().replaceAll('-','').repeat(2),...extra};
 p.signature=Buffer.from(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(verificationMessage(p)))).toString('base64url');return p;
}
test('D1 summaries are bounded, preserve policy fields and support combined pagination',async()=>{
 const env=silent();for(let n=0;n<32;n++)store(env,tool('fixture-'+n,{category:n%2?'ai-chat':'ai-coding',pricing:n%3?'paid':'free',publishedAt:`2026-09-${String(n%28+1).padStart(2,'0')}T10:00:00.000Z`}));
 const repo=new CatalogRepository(env.DB),page=await repo.list({category:'ai-coding',pricing:'paid',limit:3});assert.equal(page.tools.length,3);assert.ok(page.nextCursor);assert.ok(page.tools.every(t=>!('description'in t)&&!('sources'in t)&&t.descriptionLength>=300));
 const next=await repo.list({category:'ai-coding',pricing:'paid',limit:3,cursor:page.nextCursor});assert.ok(next.tools.every(t=>!page.tools.some(p=>p.slug===t.slug)));assert.equal(next.total,page.total);
 assert.equal((await repo.list({q:'complete directory',category:'ai-chat'})).total,16);
 await assert.rejects(()=>repo.list({cursor:'not-a-cursor'}));
});
test('archived and unapproved products are excluded from every public surface',async()=>{
 const env=silent();store(env,tool('visible'));store(env,tool('archived',{status:'archived'}));store(env,tool('private',{approved:false}));
 for(const path of ['/','/tools','/new','/category/ai-coding','/api/content','/sitemap-tools.xml','/compare?slugs=visible,archived,private']){const response=await call(env,path);assert.equal(response.status,200,path);const text=await response.text();assert.ok(!text.includes('Isolated archived')&&!text.includes('Isolated private'),path);}
 for(const path of ['/tool/archived','/tool/private','/tool/private/card.svg'])assert.equal((await call(env,path)).status,404);
 const stars=await call(env,'/api/stars?slugs=visible,private,archived');assert.deepEqual((await stars.json()).counts,{visible:0});
});
test('shared shell, canonical and structured data appear on dynamic pages; HEAD is empty',async()=>{
 const env=silent();store(env,tool());const response=await call(env,'/tool/isolated-project');const text=await response.text();assert.ok(text.includes(publicHeader('/tool/isolated-project')));assert.ok(text.includes(publicFooter()));assert.match(text,/SoftwareApplication/);assert.match(text,/rel="canonical" href="https:\/\/wishmeteor.net\/tool\/isolated-project"/);assert.match(text,/data-measurement-id=/);assert.match(text,/card\.png\?v=/);
 const head=await call(env,'/tool/isolated-project',undefined,{method:'HEAD'});assert.equal(await head.text(),'');assert.equal(head.headers.get('etag'),response.headers.get('etag'));
 assert.equal((await call(env,'/tool/isolated-project',undefined,{headers:{'if-none-match':response.headers.get('etag')}})).status,304);
});
test('publication allowance is UTC, atomic and independent of the original submission date',async()=>{
 const env=silent();for(let n=1;n<=10;n++){const id=pending(env,n);env.DB.sqlite.prepare("UPDATE submissions SET created_at='2026-01-01T00:00:00.000Z' WHERE id=?").run(id);const result=await admin(env,`/api/admin/submissions/${id}/approve`,{slug:'project-'+n,content:approvedContent(n)});assert.equal(result.status,n<=9?200:409);if(n===10)assert.equal((await result.json()).error,'daily-cap-reached');}
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_tools').get().n,9);assert.equal(env.DB.sqlite.prepare('SELECT used FROM publication_days WHERE day=?').get(new Date().toISOString().slice(0,10)).used,9);
 assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM notification_outbox WHERE kind='approved'").get().n,9);
 const tool=await new CatalogRepository(env.DB).get('project-1');assert.equal(tool.submittedAt,'2026-01-01T00:00:00.000Z');assert.equal(tool.publishedAt.slice(0,10),new Date().toISOString().slice(0,10));
});
test('approval rejects mismatched URL, missing blessing, existing slug and repeated verdict',async()=>{
 const env=silent(),id=pending(env,1);const content=approvedContent(1);assert.equal((await admin(env,`/api/admin/submissions/${id}/approve`,{slug:content.slug,content:{...content,url:'https://different.com'}})).status,400);
 assert.equal((await admin(env,`/api/admin/submissions/${id}/approve`,{slug:content.slug,content:{...content,wish:{...content.wish,blessingApproved:false}}})).status,400);
 store(env,tool('occupied'));assert.equal((await admin(env,`/api/admin/submissions/${id}/approve`,{slug:'occupied',content})).status,409);
 assert.equal((await admin(env,`/api/admin/submissions/${id}/approve`,{slug:content.slug,content})).status,200);
 assert.equal((await admin(env,`/api/admin/submissions/${id}/approve`,{slug:content.slug,content})).status,409);assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM tool_cards WHERE slug=?').get(content.slug).n,1);
});
test('approval races never overwrite a product or spend a second daily slot',async()=>{
 const env=silent(),id=pending(env,1),content=approvedContent(1);let raced=false;env.DB.beforeBatch=async statements=>{if(!raced&&statements.some(s=>s.sql.includes('publication_days SET'))){raced=true;env.DB.beforeBatch=null;assert.equal((await admin(env,`/api/admin/submissions/${id}/approve`,{slug:content.slug,content})).status,200);}};
 assert.equal((await admin(env,`/api/admin/submissions/${id}/approve`,{slug:content.slug,content})).status,409);assert.equal(env.DB.sqlite.prepare('SELECT used FROM publication_days').get().used,1);assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_tools').get().n,1);
});
test('concurrent editing requires the loaded content version even in the same millisecond',async()=>{
 const env=silent(),original=tool();store(env,original);assert.equal((await admin(env,'/api/admin/content/'+original.slug,{...original,summary:original.summary+'!',expectedVersion:'wrong'}, {method:'PUT'})).status,428);
 let raced=false;env.DB.beforeBatch=async()=>{if(!raced){raced=true;env.DB.beforeBatch=null;env.DB.sqlite.prepare("UPDATE managed_tools SET content_json=json_set(content_json,'$.contentVersion','concurrent-version') WHERE slug=?").run(original.slug);}};
 const result=await admin(env,'/api/admin/content/'+original.slug,{...original,summary:original.summary+'!',expectedVersion:original.contentVersion},{method:'PUT'});assert.equal(result.status,409);assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM tool_events').get().n,0);
});
test('signed link outcomes bind URL and slug, reject replay, and immediately downgrade failures',async()=>{
 const env=silent(),original=tool();store(env,original);const proof=await sign(env,original.slug,original.url);
 assert.equal((await admin(env,'/api/admin/content/'+original.slug+'/verification',{verification:{...proof,url:'https://wrong.com'}})).status,400);
 assert.equal((await admin(env,'/api/admin/content/'+original.slug+'/verification',{verification:proof})).status,200);assert.ok(isDofollow(await new CatalogRepository(env.DB).get(original.slug)));
 // The same signed observation cannot be reused; its transaction rolls back.
 assert.equal((await admin(env,'/api/admin/content/'+original.slug+'/verification',{verification:proof})).status,409);
 const blocked=await sign(env,original.slug,original.url,'blocked');assert.equal((await admin(env,'/api/admin/content/'+original.slug+'/verification',{verification:blocked})).status,200);
 const after=await new CatalogRepository(env.DB).get(original.slug);assert.equal(after.lastCheckState,'blocked');assert.equal(isDofollow(after),false);assert.match(outboundRel(after),/nofollow/);
});
test('versioned cards share the full blessing and remain bound to a public current listing',async()=>{
 const env=silent(),value=approvedContent(1),id=pending(env,1);const result=await admin(env,`/api/admin/submissions/${id}/approve`,{slug:value.slug,content:value});const published=(await result.json()).tool;
 const svg=await call(env,`/tool/${value.slug}/card.svg?v=${published.contentVersion}`);assert.equal(svg.status,200);assert.match(await svg.text(),new RegExp(value.wish.blessingLong.slice(0,50)));assert.match(cardSvg(published),new RegExp(published.contentVersion));
 assert.equal((await call(env,`/tool/${value.slug}/card.svg?v=unknown`)).status,404);
 env.DB.sqlite.prepare("UPDATE managed_tools SET content_json=json_set(content_json,'$.status','archived') WHERE slug=?").run(value.slug);assert.equal((await call(env,`/tool/${value.slug}/card.svg?v=${published.contentVersion}`)).status,404);
});
test('opaque browser identity rejects random UUID votes and records one counted encouragement per product',async()=>{
 const env=silent();store(env,tool());assert.equal((await call(env,'/api/stars',{slug:'isolated-project',voter:crypto.randomUUID()})).status,409);
 const identity=await call(env,'/api/stars/identity',{}),cookie=identity.headers.get('set-cookie').split(';')[0];assert.match(cookie,/__Host-wm_voter=/);
 const first=await call(env,'/api/stars',{slug:'isolated-project'},{cookie});assert.deepEqual(await first.json(),{count:1,alreadyLit:false});assert.deepEqual(await (await call(env,'/api/stars',{slug:'isolated-project'},{cookie})).json(),{count:1,alreadyLit:true});
 assert.deepEqual((await (await call(env,'/api/stars?slugs=isolated-project',undefined,{cookie})).json()).lit,['isolated-project']);assert.equal(env.DB.sqlite.prepare('SELECT trusted_star_count FROM managed_tools').get().trusted_star_count,1);
 for(let n=0;n<9;n++)assert.equal((await call(env,'/api/stars/identity',{})).status,200);assert.equal((await call(env,'/api/stars/identity',{})).status,429);
});
test('submission writes and both receipts share a transaction; duplicates are blocked across review paths',async()=>{
 const env=silent(),payload={name:'A project',url:'https://a-project.com',email:'maker@example.com',category:'ai-coding',notes:'A practical project.',makeAWish:'May the next step be useful.',own:'yes',hp:''};
 const submitted=await call(env,'/api/submit',payload);assert.equal(submitted.status,201);const id=(await submitted.json()).id;assert.ok(id>0);const queue=env.DB.sqlite.prepare('SELECT kind,submission_id FROM notification_outbox').all();assert.deepEqual(queue.map(r=>r.kind).sort(),['receipt','support']);assert.ok(queue.every(r=>r.submission_id===id));
 assert.equal((await call(env,'/api/submit',payload)).status,409);const draft=tool('a-project');assert.equal((await admin(env,'/api/admin/content/a-project',draft,{method:'PUT'})).status,409);
});
test('registered owners see progress, save/follow projects and submit scoped corrections',async()=>{
 const env=silent(),email='owner@example.com',password='isolated-owner-password';await auth(env,'/api/auth/register',{email,password});await auth(env,'/api/auth/verify?token='+verificationToken(env,email));const login=await auth(env,'/api/auth/login',{email,password});const cookie=login.headers.get('set-cookie').split(';')[0];store(env,tool());
 assert.equal((await call(env,'/api/account/projects/isolated-project',{bookmarked:true,following:true},{cookie,method:'PUT'})).status,200);assert.equal((await (await call(env,'/api/account/projects',undefined,{cookie})).json()).projects.length,1);
 assert.equal((await call(env,'/api/account/corrections/isolated-project',{message:'The listed pricing label should be updated.'},{cookie})).status,201);
 const submission=await call(env,'/api/submit',{name:'My other project',url:'https://my-other-project.com',email,category:'ai-chat',notes:'A helpful product.',makeAWish:'Build something useful.',own:'yes'},{cookie});const id=(await submission.json()).id;
 assert.equal((await call(env,'/api/account/submissions',undefined,{cookie})).status,200);assert.equal((await call(env,'/api/account/submissions/'+id,undefined,{cookie,method:'DELETE'})).status,200);assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM notification_outbox WHERE submission_id IS NULL AND state='cancelled' AND kind IN ('receipt','support')").get().n,2);
});
test('outbox records provider acceptance, retries temporary errors and suppresses withdrawn work',async()=>{
 const env=environment();const id=pending(env,1);await admin(env,`/api/admin/submissions/${id}/approve`,{slug:'project-1',content:approvedContent(1)});assert.equal(env.mail.length,1);const row=env.DB.sqlite.prepare('SELECT * FROM notification_outbox').get();assert.equal(row.state,'accepted');assert.match(row.message_id,/isolated-message/);assert.ok(env.DB.sqlite.prepare('SELECT email FROM submissions').get().email);
 assert.deepEqual(await dispatchOutbox(env),{accepted:0,failed:0,cancelled:0});
});
test('schema rejects invalid dates, dangerous URLs and object fields before writing',async()=>{
 const value=tool();for(const url of ['https://127.0.0.1','https://private.local','https://user:password@public.com','https://public.com:444','https://wishmeteor.net'])assert.equal(canonicalProductUrl(url),null,url);
 assert.notEqual(canonicalProductUrl('https://github.com/one/repo').projectKey,canonicalProductUrl('https://github.com/two/repo').projectKey);assert.notEqual(canonicalProductUrl('https://apps.apple.com/us/app/a/id123').projectKey,canonicalProductUrl('https://apps.apple.com/us/app/b/id456').projectKey);
 assert.ok(validateTool({...value,firstSeenAt:'2026-02-31'},value.slug).errors.length);assert.ok(validateTool({...value,sources:{url:value.url}},value.slug).errors.length);
 const env=silent();assert.equal((await call(env,'/api/auth/register',{email:'x@example.com',password:'x'.repeat(16000)})).status,413);assert.equal((await call(env,'/api/submit',{name:{bad:'shape'}})).status,400);
});
test('large fixtures use ordered public indexes and return a small page',async()=>{
 const env=silent(),sqlite=env.DB.sqlite;sqlite.exec('BEGIN');for(let n=0;n<6000;n++)store(env,tool('large-'+n));sqlite.exec('COMMIT');sqlite.exec('ANALYZE');const repo=new CatalogRepository(env.DB),start=performance.now();const page=await repo.list({limit:12});assert.equal(page.total,6000);assert.equal(page.tools.length,12);assert.ok(JSON.stringify(page).length<22000);
 const query=env.DB.queries.findLast(row=>row.sql.includes('LIMIT ? OFFSET ?'));const plan=sqlite.prepare('EXPLAIN QUERY PLAN '+query.sql).all(...query.values);assert.ok(!plan.some(row=>row.detail.includes('USE TEMP B-TREE')),JSON.stringify(plan));assert.ok(performance.now()-start<5000);console.log('6000 product fixture page:',Math.round(performance.now()-start),'ms;',JSON.stringify(page).length,'bytes;',plan.map(row=>row.detail).join(' | '));
});
