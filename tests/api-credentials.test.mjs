import test from 'node:test';
import assert from 'node:assert/strict';
import { environment,googleRequest,submit,submissionForm,screenshotBytes } from './harness.mjs';
import { call,tool } from './fixtures.mjs';
import { sha256,randomToken } from '../worker/security.ts';
const owner='lvyinchao@gmail.com';
async function credential(env,email=owner,extra={}) {
 const login=await googleRequest(env,email);assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0],account=env.DB.sqlite.prepare('SELECT id FROM accounts WHERE email=?').get(email);
 const token='wm_live_'+randomToken(),id=crypto.randomUUID();
 env.DB.sqlite.prepare('INSERT INTO account_api_credentials(id,account_id,token_hash,name,token_prefix,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,?,?)')
   .run(id,account.id,await sha256(token),'Isolated submission API',token.slice(0,16),new Date().toISOString(),extra.expiresAt ?? null,extra.revokedAt ?? null);
 return {token,id,cookie,accountId:account.id};
}
function bearer(token,extra={}) {return {headers:{authorization:'Bearer '+token,...extra}};}
function form(n=1,email=owner) {return submissionForm({name:'API project '+n,url:'https://api-project-'+n+'.com',email,category:'ai-coding',notes:tool().description,own:'yes'});}
function withoutOrigin(requestOptions) {return {...requestOptions,headers:{...requestOptions.headers,origin:''}};}
function silent(){const env=environment();env.EMAIL=undefined;return env;}

test('owner bearer auto-publishes without Origin or Cookie beyond all ordinary quotas',async()=>{
 const env=silent(),{token}=await credential(env),day=new Date().toISOString().slice(0,10);
 env.DB.sqlite.prepare('INSERT INTO publication_days(day,used,exception_used) VALUES(?,9,0)').run(day);
 const before=env.DB.sqlite.prepare('SELECT COUNT(*) n FROM auth_rate_limits').get().n;
 for(let n=1;n<=6;n++){
  const result=await call(env,'/api/submit',form(n),withoutOrigin(bearer(token)));assert.equal(result.status,201);assert.equal(result.headers.get('content-type'),'application/json; charset=utf-8');
  const body=await result.json();assert.equal(body.status,'published');
  const value=JSON.parse(env.DB.sqlite.prepare('SELECT content_json FROM managed_tools WHERE slug=?').get(body.slug).content_json);
  assert.equal(value.linkPolicy,'dofollow');assert.equal(value.description,tool().description);
  const image=await call(env,value.coverImage);assert.deepEqual(Buffer.from(await image.arrayBuffer()),screenshotBytes);
 }
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM auth_rate_limits').get().n,before);
 assert.equal(env.DB.sqlite.prepare('SELECT used FROM publication_days WHERE day=?').get(day).used,9);
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM notification_outbox').get().n,6);
 const identity=await call(env,'/api/token',undefined,withoutOrigin(bearer(token)));assert.equal(identity.status,200);
 const data=await identity.json();assert.equal(data.account.email,owner);assert.deepEqual(data.account.submissionPolicy,{automaticApproval:true,rateLimited:false,dofollow:true});
 assert.deepEqual(data.token.scopes,['submissions:write','submissions:read']);assert.ok(!JSON.stringify(data).includes(token));
 const list=await call(env,'/api/account/submissions',undefined,withoutOrigin(bearer(token)));assert.equal((await list.json()).submissions.length,6);
 assert.equal((await call(env,'/api/submit',form(1),withoutOrigin(bearer(token)))).status,409);
});

test('unknown, malformed, expired and revoked tokens fail closed even with a valid session',async()=>{
 const env=silent(),active=await credential(env),expired=await credential(env,owner,{expiresAt:'2000-01-01T00:00:00.000Z'}),revoked=await credential(env,owner,{revokedAt:new Date().toISOString()});
 for(const token of ['wrong', 'wm_live_'+randomToken(),expired.token,revoked.token]){
  for(const path of ['/api/token','/api/account/submissions','/api/submit']){
   const result=await call(env,path,path==='/api/submit'?form():undefined,{cookie:active.cookie,...bearer(token)});
   assert.equal(result.status,401);assert.equal((await result.json()).error,'invalid-api-token');
  }
 }
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM submissions').get().n,0);assert.equal(env.PRODUCT_SCREENSHOTS.objects.size,0);
});

test('token identity cannot impersonate a form email or bypass submission content checks',async()=>{
 const env=silent(),{token}=await credential(env);
 assert.equal((await call(env,'/api/submit',form(1,'other@example.com'),withoutOrigin(bearer(token)))).status,403);
 let input={name:'API project',url:'https://api-validation.com',email:owner,own:'yes',notes:tool().description};
 assert.equal((await call(env,'/api/submit',input,withoutOrigin(bearer(token)))).status,400);
 assert.equal((await submit(env,{...input,notes:'Too short'},withoutOrigin(bearer(token)))).status,400);
 assert.equal((await submit(env,{...input,own:'no'},withoutOrigin(bearer(token)))).status,400);
 assert.equal((await submit(env,{...input,url:'http://127.0.0.1'},withoutOrigin(bearer(token)))).status,400);
 assert.equal(env.PRODUCT_SCREENSHOTS.objects.size,0);
});

test('ordinary token holders remain queued and limited; read access is restricted to their own submissions',async()=>{
 const env=silent(),a=await credential(env,'ordinary@gmail.com'),b=await credential(env,'another@gmail.com');
 for(let n=1;n<=5;n++){const response=await call(env,'/api/submit',form(n,'ordinary@gmail.com'),withoutOrigin(bearer(a.token)));assert.equal(response.status,201);assert.equal((await response.json()).status,'queued');}
 assert.equal((await call(env,'/api/submit',form(6,'ordinary@gmail.com'),withoutOrigin(bearer(a.token)))).status,429);
 assert.equal((await (await call(env,'/api/account/submissions',undefined,bearer(b.token))).json()).submissions.length,0);
 assert.equal((await call(env,'/api/submit',form(7,owner),withoutOrigin(bearer(b.token)))).status,403);
});

test('a submission credential has no admin, account mutation or browser login authority',async()=>{
 const env=silent(),{token}=await credential(env);
 assert.equal((await call(env,'/api/admin/metrics',undefined,bearer(token))).status,401);
 assert.equal((await (await call(env,'/api/auth/me',undefined,bearer(token))).json()).account,null);
 assert.equal((await call(env,'/api/account/submissions/1',undefined,{...bearer(token),method:'DELETE'})).status,401);
 assert.equal((await call(env,'/api/token',{},bearer(token))).status,405);
});

test('revocation disables exactly the current token and leaves other credentials usable',async()=>{
 const env=silent(),a=await credential(env),b=await credential(env);
 assert.equal((await call(env,'/api/token',undefined,{...withoutOrigin(bearer(a.token)),method:'DELETE'})).status,200);
 assert.equal((await call(env,'/api/token',undefined,bearer(a.token))).status,401);
 assert.equal((await call(env,'/api/token',undefined,bearer(b.token))).status,200);
 assert.equal((await call(env,'/api/token',undefined,{cookie:a.cookie})).status,401);
});

test('account recovery, de-verification and identity changes invalidate API credentials',async()=>{
 for(const sql of ['UPDATE accounts SET password_hash=? WHERE id=?','UPDATE accounts SET email=? WHERE id=?','UPDATE accounts SET email_verified_at=NULL WHERE id=?']){
  const env=silent(),a=await credential(env);
  env.DB.sqlite.prepare(sql).run(...(sql.includes('NULL')?[a.accountId]:[sql.includes('email=')?'new-owner@gmail.com':'new-password-hash',a.accountId]));
  assert.equal((await call(env,'/api/token',undefined,bearer(a.token))).status,401);
  assert.ok(env.DB.sqlite.prepare('SELECT revoked_at FROM account_api_credentials WHERE id=?').get(a.id).revoked_at);
 }
});
