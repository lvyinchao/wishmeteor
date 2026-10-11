import test from 'node:test';
import assert from 'node:assert/strict';
import { environment,googleRequest,screenshotBytes,request } from './harness.mjs';
import { tool,store,call } from './fixtures.mjs';
import { handleOAuth,challengeFor,principal,SCOPES } from '../worker/mcp/oauth.ts';
import { invokeTool,toolDescriptors } from '../worker/mcp/server.ts';
import { allowedFileUrl,downloadScreenshot } from '../worker/mcp/files.ts';
import { sha256 } from '../worker/security.ts';
const redirect='https://chatgpt.com/connector_platform_oauth_redirect',origin='https://wishmeteor.net';
const time=()=>new Date().toISOString();
async function form(env,path,input,cookie){return handleOAuth(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded',...(cookie?{cookie}:{})},body:new URLSearchParams(input)}),env);}
async function oauth(env,email='lvyinchao@gmail.com',scope=SCOPES.join(' ')){
 const signed=await googleRequest(env,email);assert.equal(signed.status,200);
 const session=signed.headers.get('set-cookie').split(';')[0];
 const response=await handleOAuth(request('/oauth/register',{client_name:'Isolated ChatGPT',redirect_uris:[redirect],token_endpoint_auth_method:'none'}),env),client=await response.json();assert.equal(response.status,201);
 const verifier='v'.repeat(64),query=new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',code_challenge:await challengeFor(verifier),code_challenge_method:'S256',scope,state:'isolated-state',resource:origin+'/mcp'});
 const authorization=await handleOAuth(request('/oauth/authorize?'+query,undefined,{cookie:session}),env);assert.equal(authorization.status,303);
 const cookie=authorization.headers.get('set-cookie').split(';')[0],id=new URL(authorization.headers.get('location'),origin).searchParams.get('request');
 const consent=await form(env,'/oauth/consent',{request:id,csrf:cookie.split('=')[1],decision:'allow'},session+'; '+cookie);assert.equal(consent.status,303);
 const target=new URL(consent.headers.get('location'));assert.equal(target.searchParams.get('iss'),origin);assert.equal(target.searchParams.get('state'),'isolated-state');
 const code=target.searchParams.get('code'),input={client_id:client.client_id,grant_type:'authorization_code',code,redirect_uri:redirect,code_verifier:verifier,resource:origin+'/mcp'};
 const exchanged=await form(env,'/oauth/token',input);assert.equal(exchanged.status,200);const tokens=await exchanged.json();
 return {client:client.client_id,session,cookie,id,code,verifier,input,tokens,request:request('/mcp',undefined,{headers:{authorization:'Bearer '+tokens.access_token}})};
}
function listing(n=1){return {name:'Isolated MCP '+n,official_url:'https://mcp-project-'+n+'.com',category:'ai-coding',description:tool().description,source_links:['https://mcp-project-'+n+'.com'],listing_identity:'authorized_independent',aliases:['Test alias '+n],idempotency_key:'isolated-mcp-key-'+n,screenshot:{download_url:'https://files.oaiusercontent.com/test.png?signed=isolated',file_id:'isolated-file-'+n,mime_type:'image/png',file_name:'test.png'}};}
async function withImage(work,hook){const original=globalThis.fetch;globalThis.fetch=async url=>{assert.match(String(url),/^https:\/\/files\.oaiusercontent\.com\//);if(hook)await hook();return new Response(screenshotBytes,{headers:{'content-type':'image/png'}});};try{return await work();}finally{globalThis.fetch=original;}}
const data=r=>{assert.equal(r.isError,undefined,JSON.stringify(r));return r.structuredContent;};

test('discovery advertises PKCE, issuer, resource, DCR and scoped file tools with no secret parameters',async()=>{
 const env=environment();const as=await (await handleOAuth(request('/.well-known/oauth-authorization-server'),env)).json();assert.equal(as.issuer,origin);assert.deepEqual(as.code_challenge_methods_supported,['S256']);assert.equal(as.authorization_response_iss_parameter_supported,true);assert.equal(as.client_id_metadata_document_supported,false);assert.ok(as.registration_endpoint);
 const pr=await (await handleOAuth(request('/.well-known/oauth-protected-resource/mcp'),env)).json();assert.equal(pr.resource,origin+'/mcp');
 const descriptors=toolDescriptors();assert.equal(descriptors.length,5);for(const t of descriptors){assert.equal(t.annotations.readOnlyHint,t.name!=='submit_listing');assert.deepEqual(t.securitySchemes,t._meta.securitySchemes);assert.ok(!/access_token|refresh_token|api_key/i.test(JSON.stringify(t.inputSchema)));}
 const submit=descriptors.find(t=>t.name==='submit_listing');assert.deepEqual(submit._meta['openai/fileParams'],['screenshot']);const file=submit.inputSchema.properties.screenshot;assert.deepEqual(file.required,['download_url','file_id']);assert.deepEqual(Object.keys(file.properties),['download_url','file_id','mime_type','file_name']);assert.match(submit.description,/PUBLICLY PUBLISH/);
 const result=await call(env,'/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}},{headers:{accept:'application/json, text/event-stream'}});assert.equal(result.status,200);assert.equal((await result.json()).result.serverInfo.name,'WishMeteor');
 const tools=await call(env,'/mcp',{jsonrpc:'2.0',id:2,method:'tools/list'},{headers:{accept:'application/json, text/event-stream'}});assert.equal(tools.status,200);assert.equal((await tools.json()).result.tools.length,5);
});
test('OAuth requires consent, PKCE, exact redirect, resource, single-use code and binds account',async()=>{
 const env=environment(),flow=await oauth(env),auth=await principal(flow.request,env);assert.equal(auth.account.email,'lvyinchao@gmail.com');
 assert.equal((await form(env,'/oauth/token',flow.input)).status,400);
 const wrong=await form(env,'/oauth/token',{...flow.input,resource:'https://evil.com'});assert.equal((await wrong.json()).error,'invalid_target');
 for(const token of ['wm_live_'+ 'a'.repeat(64),'a'.repeat(64),flow.tokens.refresh_token])assert.equal(await principal(request('/mcp',undefined,{headers:{authorization:'Bearer '+token}}),env),null);
 const row=env.DB.sqlite.prepare("SELECT hash FROM mcp_tokens WHERE kind='access'").get();assert.notEqual(row.hash,flow.tokens.access_token);
 const output=data(await invokeTool(flow.request,env,'get_account',{}));assert.equal(output.account.id,auth.account.id);assert.equal(output.requirements.screenshot_max_bytes,5*1024*1024);assert.ok(!JSON.stringify(output).includes(flow.tokens.access_token));assert.ok(!JSON.stringify(output).includes(flow.tokens.refresh_token));
});
test('missing auth, insufficient scope, expired audience and recovery fail closed',async()=>{
 const env=environment(),flow=await oauth(env,'reader@gmail.com','account:read'),auth=await principal(flow.request,env);
 assert.equal((await invokeTool(request('/mcp'),env,'get_account',{})).structuredContent.error.http_status,401);
 assert.equal((await invokeTool(flow.request,env,'submit_listing',listing())).structuredContent.error.http_status,403);
 env.DB.sqlite.prepare("UPDATE mcp_grants SET audience='https://other.com'").run();assert.equal(await principal(flow.request,env),null);
 env.DB.sqlite.prepare('UPDATE mcp_grants SET audience=?').run(origin+'/mcp');env.DB.sqlite.prepare("UPDATE mcp_tokens SET expires_at='2000-01-01' WHERE kind='access'").run();assert.equal(await principal(flow.request,env),null);
 env.DB.sqlite.prepare("UPDATE mcp_tokens SET expires_at='2099-01-01'").run();env.DB.sqlite.prepare('UPDATE accounts SET email=? WHERE id=?').run('changed@gmail.com',auth.account.id);assert.equal(await principal(flow.request,env),null);
});
test('refresh rotation and replay revocation invalidate all access for the grant',async()=>{
 const env=environment(),flow=await oauth(env),input={client_id:flow.client,grant_type:'refresh_token',refresh_token:flow.tokens.refresh_token,resource:origin+'/mcp'};
 const response=await form(env,'/oauth/token',input);assert.equal(response.status,200);const next=await response.json();assert.notEqual(next.refresh_token,flow.tokens.refresh_token);
 assert.equal((await form(env,'/oauth/token',input)).status,400);assert.equal(await principal(flow.request,env),null);assert.equal(await principal(request('/mcp',undefined,{headers:{authorization:'Bearer '+next.access_token}}),env),null);
});
test('public duplicate lookup distinguishes shared projects and protects other accounts pending rows',async()=>{
 const env=environment(),a=await oauth(env,'first@gmail.com'),b=await oauth(env,'second@gmail.com');store(env,tool('shared-project',{name:'Shared Project',url:'https://github.com/org/one',aliases:['Special alias']}));
 let r=data(await invokeTool(a.request,env,'check_duplicate',{name:'Else',official_url:'https://github.com/org/two'}));assert.equal(r.duplicate,false);
 r=data(await invokeTool(a.request,env,'check_duplicate',{name:'Else',official_url:'https://github.com/org/one/?utm_source=tracking'}));assert.equal(r.matches[0].public_url,origin+'/tool/shared-project');assert.deepEqual(r.matches[0].reasons,['normalized_official_url_or_url_alias']);
 r=data(await invokeTool(a.request,env,'check_duplicate',{name:'special ALIAS',official_url:'https://another-domain.com'}));assert.equal(r.duplicate,true);
 await withImage(async()=>{const input=listing();data(await invokeTool(a.request,env,'submit_listing',input));assert.equal(data(await invokeTool(b.request,env,'check_duplicate',{name:input.name,official_url:input.official_url})).duplicate,false);assert.equal(data(await invokeTool(a.request,env,'check_duplicate',{name:input.name,official_url:input.official_url})).matches[0].status,'pending_review');});
});
test('real screenshot submit auto-publishes; persisted reread and sitemap are current; retries create one record',async()=>{
 const env=environment();env.EMAIL=undefined;const flow=await oauth(env),input=listing();
 await withImage(async()=>{
  const first=data(await invokeTool(flow.request,env,'submit_listing',input));assert.equal(first.status,'published');assert.equal(first.idempotent_replay,false);assert.ok(first.public_url);assert.equal(first.listing_identity,'authorized_independent');assert.equal(first.screenshot.state,'stored');
  for(const query of [{submission_id:first.submission_id},{idempotency_key:input.idempotency_key}]){const saved=data(await invokeTool(flow.request,env,'get_submission',query));assert.equal(saved.description,input.description);assert.deepEqual(saved.source_links,input.source_links);}
  const map=data(await invokeTool(flow.request,env,'check_sitemap',{public_url:first.public_url}));assert.equal(map.in_sitemap,true);assert.equal(map.public_link_status,200);assert.equal(map.google_indexed,'not_checked');
  const again=data(await invokeTool(flow.request,env,'submit_listing',{...input,screenshot:{...input.screenshot,download_url:'https://expired.invalid/not-used'}}));assert.equal(again.submission_id,first.submission_id);assert.equal(again.idempotent_replay,true);
  assert.equal((await invokeTool(flow.request,env,'submit_listing',{...input,description:input.description+' changed'})).structuredContent.error.code,'idempotency-key-conflict');
  assert.equal((await invokeTool(flow.request,env,'submit_listing',{...input,idempotency_key:'another-key-123456'})).structuredContent.error.code,'duplicate');
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM submissions').get().n,1);assert.equal(env.PRODUCT_SCREENSHOTS.objects.size,1);
 });
});
test('ordinary grants keep rate limits, own submission isolation and no public screenshot until approval',async()=>{
 const env=environment();env.EMAIL=undefined;const a=await oauth(env,'ordinary@gmail.com'),b=await oauth(env,'other@gmail.com');
 await withImage(async()=>{for(let n=1;n<=5;n++){const result=data(await invokeTool(a.request,env,'submit_listing',listing(n)));assert.equal(result.status,'pending_review');assert.equal(result.public_url,null);assert.equal(result.screenshot.public_url,null);assert.equal((await invokeTool(b.request,env,'get_submission',{submission_id:result.submission_id})).structuredContent.error.http_status,404);}assert.equal((await invokeTool(a.request,env,'submit_listing',listing(6))).structuredContent.error.http_status,429);});
});
test('file downloads reject SSRF, redirects, MIME disguises and oversized bodies',async()=>{
 for(const url of ['file:///tmp/x.png','http://files.oaiusercontent.com/a','https://localhost/a','https://127.0.0.1/a','https://files.oaiusercontent.com.evil.com/a','https://files.oaiusercontent.com@evil.com/a','https://evil.com/a','https://files.oaiusercontent.com:444/a'])assert.equal(allowedFileUrl(url),false,url);
 const original=globalThis.fetch,input=listing().screenshot;
 try{
  globalThis.fetch=async(_url,options)=>{assert.equal(options.redirect,'error');throw new Error('redirect');};await assert.rejects(downloadScreenshot(input),/screenshot-download-failed/);
  globalThis.fetch=async()=>new Response('<svg></svg>',{headers:{'content-type':'image/png'}});await assert.rejects(downloadScreenshot(input),/screenshot-invalid/);
  globalThis.fetch=async()=>new Response(screenshotBytes,{headers:{'content-type':'image/jpeg'}});await assert.rejects(downloadScreenshot(input),/screenshot-invalid/);
  globalThis.fetch=async()=>new Response(screenshotBytes,{headers:{'content-type':'image/png','content-length':String(5*1024*1024+1)}});await assert.rejects(downloadScreenshot(input),/screenshot-too-large/);
 }finally{globalThis.fetch=original;}
});
test('revocation at download and atomic save boundaries stops publication and cleans orphan screenshots',async()=>{
 for(const boundary of ['download','save']){
  const env=environment(),flow=await oauth(env);let once=false;
  if(boundary==='save')env.DB.beforeBatch=async statements=>{if(!once&&statements.some(s=>s.sql.includes('INSERT INTO submissions'))){once=true;env.DB.sqlite.prepare('UPDATE mcp_grants SET revoked_at=?').run(time());}};
  await withImage(async()=>{const result=await invokeTool(flow.request,env,'submit_listing',listing());assert.equal(result.isError,true);assert.equal(result.structuredContent.error.http_status,401);},boundary==='download'?async()=>env.DB.sqlite.prepare('UPDATE mcp_grants SET revoked_at=?').run(time()):undefined);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM submissions').get().n,0);assert.equal(env.PRODUCT_SCREENSHOTS.objects.size,0);
 }
});
test('revoke endpoint disables access and refresh and subsequent MCP HTTP receives auth challenge',async()=>{
 const env=environment(),flow=await oauth(env);assert.equal((await form(env,'/oauth/revoke',{client_id:flow.client,token:flow.tokens.access_token})).status,200);
 const response=await call(env,'/mcp',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'submit_listing',arguments:listing()}},{headers:{authorization:'Bearer '+flow.tokens.access_token,accept:'application/json, text/event-stream'}});assert.equal(response.status,401);assert.match(response.headers.get('www-authenticate'),/oauth-protected-resource/);
 assert.equal((await form(env,'/oauth/token',{client_id:flow.client,grant_type:'refresh_token',refresh_token:flow.tokens.refresh_token,resource:origin+'/mcp'})).status,400);assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM submissions').get().n,0);
});
test('consent denies CSRF and redirect changes; unauthorized clients cannot register arbitrary callbacks',async()=>{
 const env=environment(),flow=await oauth(env);const bad=await handleOAuth(request('/oauth/register',{token_endpoint_auth_method:'none',redirect_uris:['https://evil.com/callback']}),env);assert.equal(bad.status,400);
 const query=new URLSearchParams({client_id:flow.client,redirect_uri:redirect,response_type:'code',code_challenge:await challengeFor(flow.verifier),code_challenge_method:'S256',scope:SCOPES.join(' '),state:'s',resource:origin+'/mcp'});
 const response=await handleOAuth(request('/oauth/authorize?'+query,undefined,{cookie:flow.session}),env),cookie=response.headers.get('set-cookie').split(';')[0],id=new URL(response.headers.get('location'),origin).searchParams.get('request');
 assert.equal((await form(env,'/oauth/consent',{request:id,csrf:'wrong',decision:'allow'},flow.session+'; '+cookie)).status,403);
 const cancel=await form(env,'/oauth/consent',{request:id,csrf:cookie.split('=')[1],decision:'deny'},flow.session+'; '+cookie);assert.equal(new URL(cancel.headers.get('location')).searchParams.get('error'),'access_denied');
});
test('a committed write with a lost response remains queryable and replays without a second cover',async()=>{
 const env=environment(),flow=await oauth(env),input=listing(),original=env.DB.batch;let lost=false;
 env.DB.batch=async statements=>{const result=await original(statements);if(!lost&&statements.some(s=>s.sql.includes('INSERT INTO submissions'))){lost=true;throw new Error('isolated lost response');}return result;};
 await withImage(async()=>{const first=data(await invokeTool(flow.request,env,'submit_listing',input));assert.equal(first.status,'published');assert.equal(data(await invokeTool(flow.request,env,'get_submission',{idempotency_key:input.idempotency_key})).submission_id,first.submission_id);assert.equal(data(await invokeTool(flow.request,env,'submit_listing',input)).submission_id,first.submission_id);});
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM submissions').get().n,1);assert.equal(env.PRODUCT_SCREENSHOTS.objects.size,1);
});
test('atomic name guard rejects a different-URL name race after duplicate recheck',async()=>{
 const env=environment(),flow=await oauth(env),input=listing();let once=false;
 env.DB.beforeBatch=async statements=>{if(!once&&statements.some(s=>s.sql.includes('INSERT INTO submissions'))){once=true;store(env,tool('racing-name',{name:input.name,url:'https://different-racing-url.com'}));}};
 await withImage(async()=>{const r=await invokeTool(flow.request,env,'submit_listing',input);assert.equal(r.structuredContent.error.code,'duplicate');});assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM submissions').get().n,0);assert.equal(env.PRODUCT_SCREENSHOTS.objects.size,0);
});
test('shared-host lookup handles legacy root identities and nested GitLab projects without false root matches',async()=>{
 const env=environment(),flow=await oauth(env,'reader@gmail.com');
 store(env,tool('legacy-shared',{name:'Legacy hosted project',url:'https://replit.com/@owner/project-one'}));env.DB.sqlite.prepare("UPDATE managed_tools SET dedupe_key='replit.com' WHERE slug='legacy-shared'").run();
 for(const [url,expected] of [['https://replit.com/@owner/project-one',true],['https://replit.com/@owner/project-two',false]])assert.equal(data(await invokeTool(flow.request,env,'check_duplicate',{official_url:url,name:'Different name'})).duplicate,expected);
 store(env,tool('nested-one',{name:'Nested one',url:'https://gitlab.com/group/subgroup/one'}));env.DB.sqlite.prepare("UPDATE managed_tools SET dedupe_key='gitlab.com:group/subgroup' WHERE slug='nested-one'").run();
 assert.equal(data(await invokeTool(flow.request,env,'check_duplicate',{official_url:'https://gitlab.com/group/subgroup/one/-/tree/main',name:'Different name'})).duplicate,true);
 assert.equal(data(await invokeTool(flow.request,env,'check_duplicate',{official_url:'https://gitlab.com/group/subgroup/two',name:'Different name'})).duplicate,false);
});
test('actual official client performs Streamable HTTP initialize, discovery and scoped calls',async()=>{
 const {Client}=await import('@modelcontextprotocol/sdk/client/index.js'),{StreamableHTTPClientTransport}=await import('@modelcontextprotocol/sdk/client/streamableHttp.js'),worker=(await import('../worker/index.ts')).default;
 const env=environment(),flow=await oauth(env),client=new Client({name:'isolated-official-client',version:'1'});
 const transport=new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{authorization:'Bearer '+flow.tokens.access_token}},fetch:async(url,options)=>{const req=new Request(url,options);return worker.fetch(req,env,{waitUntil(){}});}});
 await client.connect(transport);const tools=await client.listTools();assert.equal(tools.tools.length,5);const result=await client.callTool({name:'get_account',arguments:{}});assert.equal(result.structuredContent.account.email,'lvyinchao@gmail.com');await client.close();
});
