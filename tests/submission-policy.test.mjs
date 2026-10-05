import test from 'node:test';
import assert from 'node:assert/strict';
import { environment,googleRequest,submit,submissionForm,screenshotBytes } from './harness.mjs';
import { call,admin,tool,approvedContent } from './fixtures.mjs';
import { automaticSubmissionAccount } from '../worker/submission-policy.ts';
import { isDofollow,outboundRel } from '../src/lib/link-policy.ts';
const owner='lvyinchao@gmail.com';
const input=(n=1,email='maker@gmail.com')=>({name:'Screenshot project '+n,url:'https://screenshot-project-'+n+'.com',email,category:'ai-coding',notes:tool().description,own:'yes'});
const cookieFor=async(env,email)=>{const response=await googleRequest(env,email);assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];};
const silent=()=>{const env=environment();env.EMAIL=undefined;return env;};

test('all new submissions require an actual bounded raster screenshot',async()=>{
 const env=silent();const empty=await call(env,'/api/submit',input());assert.equal(empty.status,400);assert.equal((await empty.json()).error,'screenshot-required');
 const forged=await call(env,'/api/submit',submissionForm(input(),new File(['<svg onload="alert(1)"></svg>'],'fake.png',{type:'image/png'})),{headers:{accept:'application/json'}});assert.equal(forged.status,400);assert.equal((await forged.json()).error,'screenshot-invalid');
 const wrongMime=await call(env,'/api/submit',submissionForm(input(),new File([screenshotBytes],'fake.jpg',{type:'image/jpeg'})),{headers:{accept:'application/json'}});assert.equal(wrongMime.status,400);
 const oversized=await call(env,'/api/submit',submissionForm(input(),new File([new Uint8Array(5*1024*1024+1)],'too-large.png',{type:'image/png'})),{headers:{accept:'application/json'}});assert.equal(oversized.status,413);
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM submissions').get().n,0);assert.equal(env.PRODUCT_SCREENSHOTS.objects.size,0);
 const worker=(await import('../worker/index.ts')).default;const huge=await worker.fetch(new Request('https://wishmeteor.net/api/submit',{method:'POST',headers:{origin:'https://wishmeteor.net','content-type':'multipart/form-data; boundary=isolated'},body:new Uint8Array(5*1024*1024+20_000)}),env,{waitUntil(){}});assert.equal(huge.status,413);
});

test('pending screenshots are private, admins can review them, and approval uses the upload as cover',async()=>{
 const env=silent(),cookie=await cookieFor(env,'maker@gmail.com'),other=await cookieFor(env,'other@gmail.com');
 const submitted=await submit(env,input(),{cookie});assert.equal(submitted.status,201);const {id}=await submitted.json();
 const row=env.DB.sqlite.prepare('SELECT * FROM submissions WHERE id=?').get(id),path='/api/product-screenshots/'+row.screenshot_key;
 assert.equal(row.verdict,'pending');assert.equal((await call(env,path)).status,404);assert.equal((await call(env,path,undefined,{cookie:other})).status,404);
 const mine=await call(env,path,undefined,{cookie});assert.equal(mine.status,200);assert.equal(mine.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await mine.arrayBuffer()),screenshotBytes);
 assert.equal((await admin(env,`/api/admin/submissions/${id}/screenshot`)).status,200);
 const content=approvedContent();Object.assign(content,{name:input().name,url:input().url});const published=await admin(env,`/api/admin/submissions/${id}/approve`,{slug:'screenshot-project-1',content});assert.equal(published.status,200);assert.equal((await published.json()).tool.coverImage,path);
 const image=await call(env,path);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),screenshotBytes);
 const page=await call(env,'/tool/screenshot-project-1');const html=await page.text();assert.ok(html.includes(path));assert.match(html,/Submitted product screenshot/);assert.ok(!html.includes(row.screenshot_key.replace('.png','.webp')));
 env.DB.sqlite.prepare("UPDATE managed_tools SET content_json=json_set(content_json,'$.status','archived') WHERE slug=?").run('screenshot-project-1');assert.equal((await call(env,path)).status,404);
});

test('a form email or unverified account cannot claim automatic publication',async()=>{
 assert.equal(automaticSubmissionAccount({email:owner,email_verified_at:null}),false);assert.equal(automaticSubmissionAccount(null),false);
 assert.equal(automaticSubmissionAccount({email:'lvyjnchao@gmail.com',email_verified_at:new Date().toISOString()}),false);
 const env=silent(),cookie=await cookieFor(env,'other@gmail.com');
 for(const options of [{},{cookie}]){const response=await submit(env,input(options.cookie?2:1,owner),options);assert.equal(response.status,201);assert.equal((await response.json()).status,'queued');}
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM managed_tools').get().n,0);
 for(let n=3;n<=5;n++)assert.equal((await submit(env,input(n,owner))).status,201);
 assert.equal((await submit(env,input(6,owner))).status,429);
 const missingAfterCap=await call(env,'/api/submit',input(7,owner));assert.equal(missingAfterCap.status,400);assert.equal((await missingAfterCap.json()).error,'screenshot-required');
 const me=await call(env,'/api/auth/me',undefined,{cookie});assert.deepEqual((await me.json()).account.submissionPolicy,{automaticApproval:false,rateLimited:true});
});

test('verified owner publishes over submission and daily caps atomically with screenshot, card, event and approval notification',async()=>{
 const env=silent(),cookie=await cookieFor(env,owner),day=new Date().toISOString().slice(0,10);
 const priorLimits=env.DB.sqlite.prepare('SELECT COUNT(*) n FROM auth_rate_limits').get().n;
 env.DB.sqlite.prepare('INSERT INTO publication_days(day,used,exception_used) VALUES(?,9,0)').run(day);
 for(let n=1;n<=12;n++){
  const response=await submit(env,input(n,owner),{cookie});assert.equal(response.status,201);const data=await response.json();assert.equal(data.status,'published');
  const row=env.DB.sqlite.prepare('SELECT * FROM submissions WHERE id=?').get(data.id);assert.equal(row.verdict,'approved');assert.equal(row.approved_slug,data.slug);assert.equal(row.email,owner);
  const record=JSON.parse(env.DB.sqlite.prepare('SELECT content_json FROM managed_tools WHERE slug=?').get(data.slug).content_json);assert.equal(record.description,input().notes);assert.equal(record.pricing,'unknown');assert.equal(record.lastVerifiedAt,null);assert.equal(record.coverImage,'/api/product-screenshots/'+row.screenshot_key);assert.equal(record.wish.blessingApproved,true);
  assert.equal(record.linkPolicy,'dofollow');assert.equal(isDofollow(record,new Date(Date.now()+100*86400000)),true);assert.equal(outboundRel(record),'noopener');
  assert.equal((await call(env,record.coverImage)).status,200);const html=await (await call(env,'/tool/'+data.slug)).text();assert.match(html,/Official link is approved as dofollow/);assert.ok(!html.includes('rel="noopener nofollow'));
 }
 const total=table=>env.DB.sqlite.prepare('SELECT COUNT(*) n FROM '+table).get().n;
 for(const table of ['submissions','managed_tools','tool_cards','tool_events','publication_exceptions','notification_outbox'])assert.equal(total(table),12,table);
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM auth_rate_limits').get().n,priorLimits);
 assert.equal(env.DB.sqlite.prepare('SELECT used FROM publication_days WHERE day=?').get(day).used,9);assert.equal(env.DB.sqlite.prepare('SELECT exception_used FROM publication_days WHERE day=?').get(day).exception_used,12);
 assert.deepEqual(env.DB.sqlite.prepare('SELECT DISTINCT kind FROM notification_outbox').all().map(x=>x.kind),['approved']);
 const duplicate=await submit(env,input(1,owner),{cookie});assert.equal(duplicate.status,409);assert.equal(env.PRODUCT_SCREENSHOTS.objects.size,12);
 const me=await call(env,'/api/auth/me',undefined,{cookie});assert.deepEqual((await me.json()).account.submissionPolicy,{automaticApproval:true,rateLimited:false});
});

test('trusted submissions require publication-ready maker text and retain normal security validation',async()=>{
 const env=silent(),cookie=await cookieFor(env,owner);
 assert.equal((await submit(env,{...input(1,owner),notes:'Too short.'},{cookie})).status,400);
 assert.equal((await submit(env,{...input(1,owner),own:'no'},{cookie})).status,400);
 assert.equal((await submit(env,input(1,owner),{cookie,headers:{origin:'https://evil.example'}})).status,403);
 assert.equal(env.PRODUCT_SCREENSHOTS.objects.size,0);
});

test('a failed database transaction cleans uploaded bytes and leaves no partial publication',async()=>{
 for(const trusted of [false,true]){
  const env=silent(),cookie=trusted?await cookieFor(env,owner):undefined;
  env.DB.sqlite.exec("CREATE TRIGGER isolated_failure BEFORE INSERT ON notification_outbox BEGIN SELECT RAISE(ABORT,'isolated-failure'); END;");
  const response=await submit(env,input(1,trusted?owner:'maker@gmail.com'),{cookie});assert.equal(response.status,503);
  for(const table of ['submissions','managed_tools','tool_cards','tool_events','publication_days','publication_exceptions'])assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM '+table).get().n,0,table);
  assert.equal(env.PRODUCT_SCREENSHOTS.objects.size,0);
 }
});

test('withdrawal cleans pending screenshot while rejected submissions remain private',async()=>{
 const env=silent(),cookie=await cookieFor(env,'maker@gmail.com');let data=await (await submit(env,input(),{cookie})).json();
 assert.equal((await call(env,'/api/account/submissions/'+data.id,undefined,{cookie,method:'DELETE'})).status,200);assert.equal(env.PRODUCT_SCREENSHOTS.objects.size,0);
 data=await (await submit(env,input(2),{cookie})).json();const key=env.DB.sqlite.prepare('SELECT screenshot_key FROM submissions WHERE id=?').get(data.id).screenshot_key;
 assert.equal((await admin(env,`/api/admin/submissions/${data.id}/reject`,{})).status,200);assert.equal((await call(env,'/api/product-screenshots/'+key)).status,404);
});


test('racing trusted duplicate submissions publish once and clean only the losing upload',async()=>{
 const env=silent(),cookie=await cookieFor(env,owner);let raced=false;
 env.DB.beforeBatch=async statements=>{if(!raced&&statements.some(x=>x.sql.includes('INSERT INTO managed_tools'))){raced=true;env.DB.beforeBatch=null;const winner=await submit(env,input(1,owner),{cookie});assert.equal(winner.status,201);}};
 const loser=await submit(env,input(1,owner),{cookie});assert.equal(loser.status,409);
 for(const table of ['submissions','managed_tools','tool_cards','tool_events','publication_exceptions','notification_outbox'])assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM '+table).get().n,1,table);
 assert.equal(env.PRODUCT_SCREENSHOTS.objects.size,1);assert.equal(env.DB.sqlite.prepare('SELECT exception_used FROM publication_days').get().exception_used,1);
});

test('a lost commit response never deletes a screenshot already linked to a submission',async()=>{
 const env=silent(),original=env.DB.batch.bind(env.DB);env.DB.batch=async statements=>{const result=await original(statements);if(statements.some(x=>x.sql.includes('INSERT INTO submissions')))throw Error('isolated-lost-response');return result;};
 assert.equal((await submit(env,input())).status,503);assert.equal(env.PRODUCT_SCREENSHOTS.objects.size,1);assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM submissions').get().n,1);
 const id=env.DB.sqlite.prepare('SELECT id FROM submissions').get().id;assert.equal((await admin(env,`/api/admin/submissions/${id}/screenshot`)).status,200);
});
