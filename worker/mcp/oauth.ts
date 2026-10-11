import { getSessionAccount,type Account } from '../auth.ts';
import { boundedBody,HttpError,json,jsonBody,requireOrigin } from '../http.ts';
import { consumeLimits,constantTimeEqual,randomToken,readCookie,secureCookie,sha256,requestIp } from '../security.ts';
import { escapeHtml } from '../../src/lib/html.ts';
import type { Env } from '../env.ts';
export const SCOPES=['account:read','submissions:read','submissions:write','sitemap:read'];
const COOKIE='__Host-wm_oauth';
export const issuer=(env:Env)=>(env.APP_ORIGIN ?? 'https://wishmeteor.net').replace(/\/$/,'');
export const resource=(env:Env)=>issuer(env)+'/mcp';
const now=()=>new Date().toISOString();
const expires=(seconds:number)=>new Date(Date.now()+seconds*1000).toISOString();
export const challengeFor=async(value:string)=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
export const authenticateHeader=(env:Env,error='invalid_token',scope?:string)=>`Bearer resource_metadata="${issuer(env)}/.well-known/oauth-protected-resource", error="${error}", error_description="WishMeteor authorization is required"${scope?`, scope="${scope}"`:''}`;
function oauthError(error:string,status=400):Response{return json({error},status);}
interface Client {id:string;name:string;redirects:string}
interface Grant {id:string;account_id:string;client_id:string;scope:string;audience:string;issuer:string;revoked_at:string|null}
interface Authorization {id:string;client_id:string;account_id:string|null;redirect_uri:string;state:string;challenge:string;scope:string;audience:string;csrf_hash:string;expires_at:string;used_at:string|null}
function validRedirect(raw:unknown):raw is string {
 if(typeof raw!=='string'||raw.length>2048)return false;
 try{const url=new URL(raw);return url.protocol==='https:'&&url.hostname==='chatgpt.com'&&!url.port&&!url.username&&!url.password&&!url.hash&&!url.search&&(url.pathname==='/connector_platform_oauth_redirect'||/^\/connector\/oauth\/[a-zA-Z0-9_-]+$/.test(url.pathname));}catch{return false;}
}
function validScopes(raw:string):boolean {const scopes=raw.split(' ');return !!raw&&scopes.length<=SCOPES.length&&new Set(scopes).size===scopes.length&&scopes.every(s=>SCOPES.includes(s));}
async function clientFor(id:string,env:Env):Promise<Client|null> {
 if(!/^wm_client_[a-f0-9]{64}$/.test(id))return null;
 return env.DB.prepare('SELECT id,name,redirects FROM mcp_clients WHERE id=?').bind(id).first<Client>();
}
async function form(request:Request):Promise<URLSearchParams>{if(!(request.headers.get('content-type') ?? '').startsWith('application/x-www-form-urlencoded'))throw new HttpError('form-required',415);const data=new URLSearchParams(await boundedBody(request,8192));for(const key of new Set(data.keys()))if(data.getAll(key).length!==1)throw new HttpError('invalid-request');return data;}
function page(title:string,body:string,cookie?:string):Response {
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)} · WishMeteor</title><style>body{font:17px system-ui;max-width:650px;margin:8vh auto;padding:24px;color:#20252c;background:#f8f6ef}a{color:#205640}button{font:inherit;padding:12px 20px;margin:12px 8px 0 0;border:1px solid #888;border-radius:8px;cursor:pointer}h1{font-size:28px}li{margin:10px 0}</style><h1>${escapeHtml(title)}</h1>${body}</html>`,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",...(cookie?{'set-cookie':cookie}:{})}});
}
async function authorize(request:Request,env:Env):Promise<Response> {
 const q=new URL(request.url).searchParams;for(const key of new Set(q.keys()))if(q.getAll(key).length!==1)return oauthError('invalid_request');
 const client=await clientFor(q.get('client_id') ?? '',env),redirect=q.get('redirect_uri') ?? '';
 if(!client||!JSON.parse(client.redirects).includes(redirect))return oauthError('invalid_client');
 const fail=(error:string)=>{const url=new URL(redirect);url.searchParams.set('error',error);url.searchParams.set('iss',issuer(env));if(q.has('state'))url.searchParams.set('state',q.get('state')!);return new Response(null,{status:303,headers:{location:url.href,'cache-control':'no-store','referrer-policy':'no-referrer'}});};
 const scope=q.get('scope') ?? SCOPES.join(' '),challenge=q.get('code_challenge') ?? '',state=q.get('state') ?? '';
 if(q.get('response_type')!=='code'||q.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(challenge)||state.length>2048)return fail('invalid_request');
 if(q.get('resource')!==resource(env))return fail('invalid_target');if(!validScopes(scope))return fail('invalid_scope');
 if(!await consumeLimits(env.DB,'mcp-authorize',[{key:requestIp(request),maximum:40}]))return oauthError('temporarily_unavailable',429);
 const account=await getSessionAccount(request,env),id=randomToken(),csrf=randomToken();
 await env.DB.prepare('INSERT INTO mcp_authorizations(id,client_id,account_id,redirect_uri,state,challenge,scope,audience,csrf_hash,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,client.id,account?.id ?? null,redirect,state,challenge,scope,resource(env),await sha256(csrf),expires(600)).run();
 return new Response(null,{status:303,headers:{location:'/oauth/consent?request='+id,'set-cookie':secureCookie(COOKIE,csrf,600),'cache-control':'no-store','referrer-policy':'no-referrer'}});
}
async function consent(request:Request,env:Env):Promise<Response> {
 const q=new URL(request.url).searchParams,data=request.method==='POST'?await form(request):q,id=data.get('request') ?? '';
 if(!/^[a-f0-9]{64}$/.test(id))return oauthError('invalid_request');
 const authorization=await env.DB.prepare('SELECT * FROM mcp_authorizations WHERE id=? AND used_at IS NULL AND expires_at>?').bind(id,now()).first<Authorization>();
 const cookie=readCookie(request,COOKIE);if(!authorization||!cookie||!constantTimeEqual(await sha256(cookie),authorization.csrf_hash))return page('Authorization expired','<p>Start a new connection from ChatGPT.</p>');
 const account=await getSessionAccount(request,env);
 if(!account)return page('Sign in to WishMeteor',`<p>Sign in with your WishMeteor account to continue.</p><p><a href="/account?oauth_request=${id}">Sign in</a></p>`);
 if(authorization.account_id&&authorization.account_id!==account.id)return oauthError('account_changed',403);
 const client=await env.DB.prepare('SELECT name FROM mcp_clients WHERE id=?').bind(authorization.client_id).first<{name:string}>();
 if(!authorization.account_id){const bound=await env.DB.prepare('UPDATE mcp_authorizations SET account_id=? WHERE id=? AND account_id IS NULL AND used_at IS NULL AND expires_at>?').bind(account.id,id,now()).run();if(!bound.meta.changes)return oauthError('account_changed',403);}
 if(request.method!=='POST')return page('Authorize WishMeteor for ChatGPT',`<p>Signed in as <strong>${escapeHtml(account.email)}</strong>.</p><p>Client: ${escapeHtml(client?.name ?? 'ChatGPT')}.</p><ul>${authorization.scope.split(' ').map(s=>`<li>${escapeHtml(s)} — ${escapeHtml({'account:read':'Read your account and submission limits','submissions:read':'Search published listings and read your submissions','submissions:write':'Submit listings and upload screenshots; trusted accounts may publish immediately','sitemap:read':'Check public links and sitemap presence'}[s] ?? s)}</li>`).join('')}</ul><p>Submitting independently with permission does not claim ownership of another website. You can revoke access at <a href="/oauth/connections">Connected assistants</a>.</p><form method="post"><input type="hidden" name="request" value="${id}"><input type="hidden" name="csrf" value="${cookie}"><button name="decision" value="allow">Authorize</button><button name="decision" value="deny">Cancel</button></form>`);
 requireOrigin(request);if(data.get('csrf')!==cookie)return oauthError('invalid_request',403);
 const target=new URL(authorization.redirect_uri);target.searchParams.set('state',authorization.state);target.searchParams.set('iss',issuer(env));
 const time=now(),grant=crypto.randomUUID(),code=randomToken(),codeHash=await sha256(code),allow=data.get('decision')==='allow';
 const results=await env.DB.batch([
  env.DB.prepare('UPDATE mcp_authorizations SET used_at=?,account_id=? WHERE id=? AND used_at IS NULL AND expires_at>? AND (account_id IS NULL OR account_id=?)').bind(time,account.id,id,time,account.id),
  ...(allow?[
   env.DB.prepare('INSERT INTO mcp_grants(id,client_id,account_id,scope,audience,issuer,created_at) SELECT ?,client_id,account_id,scope,audience,?,? FROM mcp_authorizations WHERE id=? AND changes()=1').bind(grant,issuer(env),time,id),
   env.DB.prepare('INSERT INTO mcp_codes(hash,grant_id,redirect_uri,challenge,expires_at) SELECT ?,id,?,?,? FROM mcp_grants WHERE id=?').bind(codeHash,authorization.redirect_uri,authorization.challenge,expires(120),grant)
  ]:[])
 ]);
 if(!results[0].meta.changes)return oauthError('invalid_request');
 target.searchParams.set(allow?'code':'error',allow?code:'access_denied');
 return new Response(null,{status:303,headers:{location:target.href,'set-cookie':secureCookie(COOKIE,'',0),'cache-control':'no-store','referrer-policy':'no-referrer'}});
}
async function token(request:Request,env:Env):Promise<Response> {
 const data=await form(request),clientId=data.get('client_id') ?? '';
 if(request.headers.has('authorization')||data.has('client_secret')||!await clientFor(clientId,env))return oauthError('invalid_client',401);
 if(!await consumeLimits(env.DB,'mcp-token',[{key:requestIp(request),maximum:120}]))return oauthError('temporarily_unavailable',429);
 if(data.get('resource')!==resource(env))return oauthError('invalid_target');
 const type=data.get('grant_type'),value=data.get(type==='refresh_token'?'refresh_token':'code') ?? '';
 if(!/^[a-f0-9]{64}$/.test(value)||!['authorization_code','refresh_token'].includes(type ?? ''))return oauthError('invalid_grant');
 const hash=await sha256(value),time=now();
 const row=await env.DB.prepare(type==='authorization_code'?
  'SELECT g.*,c.used_at,c.expires_at,c.redirect_uri,c.challenge FROM mcp_codes c JOIN mcp_grants g ON g.id=c.grant_id JOIN accounts a ON a.id=g.account_id WHERE c.hash=? AND a.email_verified_at IS NOT NULL':
  "SELECT g.*,t.used_at,t.expires_at FROM mcp_tokens t JOIN mcp_grants g ON g.id=t.grant_id JOIN accounts a ON a.id=g.account_id WHERE t.hash=? AND t.kind='refresh' AND a.email_verified_at IS NOT NULL")
  .bind(hash).first<Grant & {used_at:string|null;expires_at:string;redirect_uri?:string;challenge?:string}>();
 if(!row||row.client_id!==clientId||row.audience!==resource(env)||row.issuer!==issuer(env)||row.revoked_at||row.expires_at<=time)return oauthError('invalid_grant');
 if(row.used_at){if(type==='refresh_token')await env.DB.prepare('UPDATE mcp_grants SET revoked_at=? WHERE id=?').bind(time,row.id).run();return oauthError('invalid_grant');}
 if(type==='authorization_code') {
  const verifier=data.get('code_verifier') ?? '';if(!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||data.get('redirect_uri')!==row.redirect_uri||!constantTimeEqual(await challengeFor(verifier),row.challenge!))return oauthError('invalid_grant');
 }
 if(data.has('scope')&&data.get('scope')!==row.scope)return oauthError('invalid_scope');
 const access=randomToken(),refresh=randomToken(),accessHash=await sha256(access),refreshHash=await sha256(refresh),table=type==='authorization_code'?'mcp_codes':'mcp_tokens';
 const results=await env.DB.batch([
  env.DB.prepare(`UPDATE ${table} SET used_at=? WHERE hash=? AND used_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM mcp_grants WHERE id=? AND revoked_at IS NULL)`).bind(time,hash,time,row.id),
  env.DB.prepare(`INSERT INTO mcp_tokens(hash,grant_id,kind,expires_at) SELECT ?,?,'access',? WHERE changes()=1`).bind(accessHash,row.id,expires(900)),
  env.DB.prepare(`INSERT INTO mcp_tokens(hash,grant_id,kind,expires_at) SELECT ?,?,'refresh',? WHERE EXISTS(SELECT 1 FROM mcp_tokens WHERE hash=?)`).bind(refreshHash,row.id,expires(30*86400),accessHash)
 ]);
 if(!results[0].meta.changes)return oauthError('invalid_grant');
 return json({access_token:access,token_type:'Bearer',expires_in:900,refresh_token:refresh,scope:row.scope},200,{'pragma':'no-cache'});
}
export interface Principal {account:Account;scopes:string[];grantId:string}
export async function principal(request:Request,env:Env):Promise<Principal|null> {
 const header=request.headers.get('authorization') ?? '';if(!/^Bearer [a-f0-9]{64}$/.test(header))return null;
 const row=await env.DB.prepare(`SELECT a.*,g.id AS grant_id,g.scope FROM mcp_tokens t JOIN mcp_grants g ON g.id=t.grant_id JOIN accounts a ON a.id=g.account_id
 WHERE t.hash=? AND t.kind='access' AND t.expires_at>? AND g.revoked_at IS NULL AND g.audience=? AND g.issuer=? AND a.email_verified_at IS NOT NULL`)
 .bind(await sha256(header.slice(7)),now(),resource(env),issuer(env)).first<Account & {grant_id:string;scope:string}>();
 return row&&validScopes(row.scope)?{account:row,scopes:row.scope.split(' '),grantId:row.grant_id}:null;
}
async function connections(request:Request,env:Env):Promise<Response> {
 const account=await getSessionAccount(request,env);if(!account)return page('Connected assistants','<p><a href="/account">Sign in</a> to manage your authorizations.</p>');
 let csrf=readCookie(request,COOKIE);if(!csrf||!/^[a-f0-9]{64}$/.test(csrf))csrf=randomToken();
 if(request.method==='POST'){requireOrigin(request);const data=await form(request);if(data.get('csrf')!==csrf)return oauthError('invalid_request',403);await env.DB.prepare('UPDATE mcp_grants SET revoked_at=? WHERE id=? AND account_id=?').bind(now(),data.get('grant') ?? '',account.id).run();}
 const rows=await env.DB.prepare('SELECT g.id,g.scope,g.created_at,c.name FROM mcp_grants g JOIN mcp_clients c ON c.id=g.client_id WHERE g.account_id=? AND g.revoked_at IS NULL ORDER BY g.created_at DESC').bind(account.id).all<{id:string;scope:string;created_at:string;name:string}>();
 return page('Connected assistants',`<p>${escapeHtml(account.email)}</p>${(rows.results ?? []).map(g=>`<section><h2>${escapeHtml(g.name)}</h2><p>${escapeHtml(g.scope)}</p><form method="post"><input name="grant" type="hidden" value="${g.id}"><input name="csrf" type="hidden" value="${csrf}"><button>Disconnect and revoke access</button></form></section>`).join('')||'<p>No active authorizations.</p>'}<p><a href="/account">Back to account</a></p>`,secureCookie(COOKIE,csrf,600));
}
export async function handleOAuth(request:Request,env:Env):Promise<Response> {
 const path=new URL(request.url).pathname;
 if(request.method==='GET'&&['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'].includes(path))return json({resource:resource(env),authorization_servers:[issuer(env)],scopes_supported:SCOPES,bearer_methods_supported:['header'],resource_name:'WishMeteor private connector'});
 if(request.method==='GET'&&path==='/.well-known/oauth-authorization-server')return json({issuer:issuer(env),authorization_endpoint:issuer(env)+'/oauth/authorize',token_endpoint:issuer(env)+'/oauth/token',registration_endpoint:issuer(env)+'/oauth/register',revocation_endpoint:issuer(env)+'/oauth/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],scopes_supported:SCOPES,client_id_metadata_document_supported:false,authorization_response_iss_parameter_supported:true});
 try {
  if(path==='/oauth/register'&&request.method==='POST') {
   if(!await consumeLimits(env.DB,'mcp-register',[{key:requestIp(request),maximum:20}]))return oauthError('temporarily_unavailable',429);
   const data=await jsonBody(request,8192);if(data.token_endpoint_auth_method!=='none'||!Array.isArray(data.redirect_uris)||data.redirect_uris.length<1||data.redirect_uris.length>5||data.redirect_uris.some(v=>!validRedirect(v))||(data.grant_types!==undefined&&(!Array.isArray(data.grant_types)||data.grant_types.some(v=>!['authorization_code','refresh_token'].includes(String(v))))))return oauthError('invalid_client_metadata');
   const id='wm_client_'+randomToken(),name=typeof data.client_name==='string'?data.client_name.trim().slice(0,100):'ChatGPT';
   await env.DB.prepare('INSERT INTO mcp_clients(id,name,redirects,created_at) VALUES(?,?,?,?)').bind(id,name,JSON.stringify(data.redirect_uris),now()).run();
   return json({client_id:id,client_id_issued_at:Math.floor(Date.now()/1000),client_name:name,redirect_uris:data.redirect_uris,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']},201);
  }
  if(path==='/oauth/authorize'&&request.method==='GET')return authorize(request,env);
  if(path==='/oauth/consent'&&['GET','POST'].includes(request.method))return consent(request,env);
  if(path==='/oauth/connections'&&['GET','POST'].includes(request.method))return connections(request,env);
  if(path==='/oauth/token'&&request.method==='POST')return token(request,env);
  if(path==='/oauth/revoke'&&request.method==='POST') {
   const data=await form(request),value=data.get('token') ?? '';if(/^[a-f0-9]{64}$/.test(value))await env.DB.prepare('UPDATE mcp_grants SET revoked_at=? WHERE client_id=? AND id IN (SELECT grant_id FROM mcp_tokens WHERE hash=?)').bind(now(),data.get('client_id') ?? '',await sha256(value)).run();return json({});
  }
  return oauthError('not_found',404);
 }catch(error){if(error instanceof HttpError)return oauthError(error.code,error.status);return oauthError('server_error',503);}
}
