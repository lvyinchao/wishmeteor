import { HttpError,json,jsonBody,requireOrigin } from './http.ts';
import { authLimit,constantTimeEqual,randomToken,readCookie,secureCookie,sha256 } from './security.ts';
import { escapeHtml } from '../src/lib/html.ts';

const SESSION_COOKIE='__Host-wm_session';
const GOOGLE_NONCE_COOKIE='__Host-wm_google_nonce';
const SESSION_SECONDS=30*24*60*60;
const encoder=new TextEncoder();

export interface AuthEnv { DB:D1Database; EMAIL?:SendEmail; GOOGLE_CLIENT_ID?:string; APP_ORIGIN?:string }
export interface Account { id:string;email:string;display_name:string;password_hash:string|null;password_salt:string|null;google_sub:string|null;email_verified_at:string|null }
const ACCOUNT_FIELDS='id,email,display_name,password_hash,password_salt,google_sub,email_verified_at';
interface Verification { account_id:string;password_hash:string|null;password_salt:string|null;purpose:string }

function emailValid(value:string):boolean { return value.length<=254 && /^[^\s@]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value); }
function inputEmail(input:Record<string,unknown>):string { const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';if(!emailValid(email))throw new HttpError('invalid-input');return email; }
function inputPassword(input:Record<string,unknown>,minimum=8):string { const password=typeof input.password==='string'?input.password:'';if(password.length<minimum||password.length>256)throw new HttpError('invalid-input');return password; }
function originFor(request:Request,env:AuthEnv):string { return (env.APP_ORIGIN || new URL(request.url).origin).replace(/\/$/,''); }
function publicAccount(account:Account) { return {id:account.id,email:account.email,name:account.display_name,methods:{password:!!account.password_hash,google:!!account.google_sub}}; }
async function byEmail(env:AuthEnv,email:string):Promise<Account|null> { return env.DB.prepare(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE email=?`).bind(email).first<Account>(); }

// Preserve the deployed KDF. Each WebCrypto operation stays within Workers' limit.
export async function derivePassword(password:string,saltHex:string):Promise<string> {
  const salt=Uint8Array.from(saltHex.match(/.{2}/g) ?? [],byte=>Number.parseInt(byte,16));
  let input=encoder.encode(password);
  for(let round=0;round<6;round++) {
    const key=await crypto.subtle.importKey('raw',input,'PBKDF2',false,['deriveBits']);
    const roundSalt=new Uint8Array(salt.length+1);roundSalt.set(salt);roundSalt[salt.length]=round;
    input=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:roundSalt,iterations:100_000},key,256));
  }
  return [...input].map(v=>v.toString(16).padStart(2,'0')).join('');
}

async function createSession(env:AuthEnv,accountId:string,passwordHash:string|null=null,googleSub:string|null=null):Promise<string|null> {
  const token=randomToken(),now=new Date();
  const result=await env.DB.prepare(`INSERT INTO auth_sessions(token_hash,account_id,created_at,expires_at)
    SELECT ?,id,?,? FROM accounts WHERE id=? AND email_verified_at IS NOT NULL
    AND (? IS NULL OR password_hash=?) AND (? IS NULL OR google_sub=?)`)
    .bind(await sha256(token),now.toISOString(),new Date(now.getTime()+SESSION_SECONDS*1000).toISOString(),accountId,passwordHash,passwordHash,googleSub,googleSub).run();
  return result.meta.changes ? token : null;
}

export async function getSessionAccount(request:Request,env:AuthEnv):Promise<Account|null> {
  const token=readCookie(request,SESSION_COOKIE);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const now=new Date().toISOString();
  const account=await env.DB.prepare(`SELECT a.id,a.email,a.display_name,a.password_hash,a.password_salt,a.google_sub,a.email_verified_at
    FROM auth_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND a.email_verified_at IS NOT NULL`)
    .bind(await sha256(token),now).first<Account>();
  if(account) await env.DB.prepare('UPDATE accounts SET last_seen_at=? WHERE id=? AND (last_seen_at IS NULL OR last_seen_at<?)')
    .bind(now,account.id,new Date(Date.now()-300_000).toISOString()).run();
  return account;
}
export async function getSessionAccountId(request:Request,env:AuthEnv):Promise<string|null> { return (await getSessionAccount(request,env))?.id ?? null; }

async function issueVerification(request:Request,env:AuthEnv,account:Account,purpose:'verify'|'reset',pendingPassword?:{hash:string;salt:string}):Promise<boolean> {
  const token=randomToken(),hash=await sha256(token),now=new Date();
  const path=purpose==='reset'?`/account?reset=${token}`:`/api/auth/verify?token=${token}`;
  const url=originFor(request,env)+path;
  const label=purpose==='reset'?'Set your WishMeteor password':'Verify your WishMeteor email';
  const text=purpose==='reset'?'Use this link to choose a new password. Completing it will sign out all existing sessions.':'Confirm your email to finish the account action you requested.';
  const expires=new Date(now.getTime()+(purpose==='reset'?3_600_000:86_400_000)).toISOString();
  const verifiedCondition=purpose==='reset'?'email_verified_at IS NOT NULL':'email_verified_at IS NULL';
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE notification_outbox SET state='cancelled' WHERE state='queued' AND kind=? AND json_extract(payload_json,'$.accountId')=?`).bind(purpose,account.id),
    env.DB.prepare(`DELETE FROM email_verifications WHERE account_id=? AND purpose=? AND EXISTS(SELECT 1 FROM accounts WHERE id=? AND ${verifiedCondition})`).bind(account.id,purpose,account.id),
    env.DB.prepare(`INSERT INTO email_verifications(token_hash,account_id,expires_at,created_at,purpose,password_hash,password_salt)
      SELECT ?,id,?,?,?,?,? FROM accounts WHERE id=? AND ${verifiedCondition}`)
      .bind(hash,expires,now.toISOString(),purpose,pendingPassword?.hash ?? null,pendingPassword?.salt ?? null,account.id),
    env.DB.prepare(`INSERT INTO notification_outbox(id,kind,recipient,payload_json,next_attempt_at,created_at)
      SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM email_verifications WHERE token_hash=?)`)
      .bind(`${purpose}:${hash}`,purpose,account.email,JSON.stringify({accountId:account.id,tokenHash:hash,subject:label,text:`${text}\n\n${url}\n\nIf you did not request this, ignore it.`,html:`<p>${escapeHtml(text)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(label)}</a></p><p>If you did not request this, ignore it.</p>`}),now.toISOString(),now.toISOString(),hash),
  ]);
  return !!results[2].meta.changes;
}

async function handleRegister(request:Request,env:AuthEnv):Promise<Response> {
  requireOrigin(request);const input=await jsonBody(request),email=inputEmail(input),password=inputPassword(input);
  if(!await authLimit(request,env.DB,'register',email,5,20))return json({error:'try-later'},429);
  const existing=await byEmail(env,email);if(existing?.email_verified_at)return json({error:'account-exists'},409);
  const salt=randomToken().slice(0,32),hash=await derivePassword(password,salt),id=existing?.id ?? crypto.randomUUID();
  // A pending password never becomes usable merely because Google verifies email.
  await env.DB.prepare('INSERT INTO accounts(id,email,created_at) VALUES(?,?,?) ON CONFLICT(email) DO NOTHING').bind(id,email,new Date().toISOString()).run();
  const account=await byEmail(env,email);if(!account||account.email_verified_at)return json({error:'account-exists'},409);
  const queued=await issueVerification(request,env,account,'verify',{hash,salt});
  return queued?json({ok:true,message:'verification-queued'},201):json({error:'account-exists'},409);
}

async function handleLogin(request:Request,env:AuthEnv):Promise<Response> {
  requireOrigin(request);const input=await jsonBody(request),email=inputEmail(input);
  const password=typeof input.password==='string'?input.password:'';
  if(!password||password.length>256)return json({error:'invalid-credentials'},400);
  if(!await authLimit(request,env.DB,'login',email,10,80))return json({error:'try-later'},429);
  const account=await byEmail(env,email);
  if(account&&!account.email_verified_at)return json({error:'email-not-verified'},403);
  const candidate=await derivePassword(password,account?.password_salt ?? '00000000000000000000000000000000');
  if(!account?.password_hash||!constantTimeEqual(candidate,account.password_hash))return json({error:'invalid-credentials'},401);
  const token=await createSession(env,account.id,candidate);if(!token)return json({error:'invalid-credentials'},401);
  await env.DB.prepare('UPDATE submissions SET account_id=? WHERE account_id IS NULL AND email=?').bind(account.id,account.email).run();
  return json({ok:true,account:publicAccount(account)},200,{'set-cookie':secureCookie(SESSION_COOKIE,token,SESSION_SECONDS)});
}

function decode64(value:string):Uint8Array {
  const binary=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
interface GoogleIdentity { sub:string;email:string;name:string;authoritativeEmail:boolean }
interface GoogleJwk extends JsonWebKey { kid?:string;alg?:string }
let cachedGoogleKeys:{keys:GoogleJwk[];until:number}|undefined;
export async function verifyGoogleIdToken(token:string,clientId:string,nonce:string):Promise<GoogleIdentity|null> {
  const parts=token.split('.');if(parts.length!==3||token.length>12_000)return null;
  let header:Record<string,unknown>,claims:Record<string,unknown>;
  try {header=JSON.parse(new TextDecoder().decode(decode64(parts[0])));claims=JSON.parse(new TextDecoder().decode(decode64(parts[1])));}catch{return null;}
  const now=Date.now()/1000;
  if(!header||!claims||header.alg!=='RS256'||typeof header.kid!=='string'||
    !(claims.aud===clientId||(Array.isArray(claims.aud)&&claims.aud.includes(clientId)))||
    !['accounts.google.com','https://accounts.google.com'].includes(String(claims.iss))||
    typeof claims.exp!=='number'||!Number.isFinite(claims.exp)||claims.exp<=now||
    typeof claims.iat!=='number'||!Number.isFinite(claims.iat)||claims.iat>now+60||
    typeof claims.nonce!=='string'||!constantTimeEqual(claims.nonce,nonce)||
    typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255||
    typeof claims.email!=='string'||!emailValid(claims.email)||claims.email_verified!==true)return null;
  if(!cachedGoogleKeys||cachedGoogleKeys.until<Date.now()||!cachedGoogleKeys.keys.some(k=>k.kid===header.kid)) {
    const response=await fetch('https://www.googleapis.com/oauth2/v3/certs',{cf:{cacheEverything:true},signal:AbortSignal.timeout(10_000)});
    if(!response.ok)return null;
    const jwks=await response.json() as {keys?:GoogleJwk[]};
    cachedGoogleKeys={keys:Array.isArray(jwks.keys)?jwks.keys:[],until:Date.now()+3_600_000};
  }
  const jwk=cachedGoogleKeys.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256'));if(!jwk)return null;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode64(parts[2]),encoder.encode(`${parts[0]}.${parts[1]}`)))return null;
  const email=claims.email.toLowerCase();
  return {sub:claims.sub,email,name:typeof claims.name==='string'?claims.name.slice(0,100):'',authoritativeEmail:email.endsWith('@gmail.com')||(typeof claims.hd==='string'&&claims.hd.length>0)};
}

async function handleGoogle(request:Request,env:AuthEnv):Promise<Response> {
  requireOrigin(request);if(!env.GOOGLE_CLIENT_ID)return json({error:'google-not-configured'},503);
  const input=await jsonBody(request,16_384),credential=typeof input.credential==='string'?input.credential:'';
  if(!credential)return json({error:'invalid-credential'},400);
  if(!await authLimit(request,env.DB,'google','all',2000,40))return json({error:'try-later'},429);
  const nonce=readCookie(request,GOOGLE_NONCE_COOKIE) ?? '';if(!/^[a-f0-9]{64}$/.test(nonce))return json({error:'invalid-credential'},401);
  const identity=await verifyGoogleIdToken(credential,env.GOOGLE_CLIENT_ID,nonce);if(!identity)return json({error:'invalid-credential'},401);
  let account=await env.DB.prepare(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE google_sub=?`).bind(identity.sub).first<Account>();
  if(!account) {
    const existing=await byEmail(env,identity.email);
    if(existing?.google_sub)return json({error:'account-conflict'},409);
    if(existing?.email_verified_at) {
      const current=await getSessionAccount(request,env);
      let authorized=current?.id===existing.id;
      if(!authorized&&existing.password_hash&&existing.password_salt&&typeof input.password==='string'&&input.password.length<=256) {
        const candidate=await derivePassword(input.password,existing.password_salt);
        authorized=constantTimeEqual(candidate,existing.password_hash);
      }
      if(!authorized)return json({error:'account-link-required'},409);
      const result=await env.DB.prepare(`UPDATE accounts SET google_sub=? WHERE id=? AND google_sub IS NULL
        AND email_verified_at IS NOT NULL AND password_hash IS ?`).bind(identity.sub,existing.id,existing.password_hash).run();
      if(!result.meta.changes)return json({error:'account-conflict'},409);
      account={...existing,google_sub:identity.sub};
    } else if(existing) {
      const now=new Date().toISOString();
      const results=await env.DB.batch([
        env.DB.prepare(`UPDATE accounts SET google_sub=?,email_verified_at=?,password_hash=NULL,password_salt=NULL,
          display_name=CASE WHEN display_name='' THEN ? ELSE display_name END WHERE id=? AND email_verified_at IS NULL AND google_sub IS NULL`)
          .bind(identity.sub,identity.authoritativeEmail?now:null,identity.name,existing.id),
        env.DB.prepare('DELETE FROM auth_sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM accounts WHERE id=? AND google_sub=?)').bind(existing.id,existing.id,identity.sub),
        env.DB.prepare('DELETE FROM email_verifications WHERE account_id=? AND EXISTS(SELECT 1 FROM accounts WHERE id=? AND google_sub=?)').bind(existing.id,existing.id,identity.sub),
        env.DB.prepare("UPDATE notification_outbox SET state='cancelled' WHERE state='queued' AND kind IN ('verify','reset') AND json_extract(payload_json,'$.accountId')=?").bind(existing.id),
      ]);
      if(!results[0].meta.changes)return json({error:'account-conflict'},409);
      account=await byEmail(env,identity.email);
    } else {
      const now=new Date().toISOString(),id=crypto.randomUUID();
      await env.DB.prepare('INSERT INTO accounts(id,email,display_name,google_sub,email_verified_at,created_at) VALUES(?,?,?,?,?,?)')
        .bind(id,identity.email,identity.name,identity.sub,identity.authoritativeEmail?now:null,now).run();
      account=await byEmail(env,identity.email);
    }
  }
  if(!account)return json({error:'account-conflict'},409);
  if(!account.email_verified_at) {
    if(!await authLimit(request,env.DB,'google-verify',account.email,3,10))return json({error:'try-later'},429);
    await issueVerification(request,env,account,'verify');
    return json({ok:true,message:'email-verification-required'},202,{'set-cookie':secureCookie(GOOGLE_NONCE_COOKIE,'',0)});
  }
  const session=await createSession(env,account.id,null,identity.sub);if(!session)return json({error:'account-conflict'},409);
  await env.DB.prepare('UPDATE submissions SET account_id=? WHERE account_id IS NULL AND email=?').bind(account.id,account.email).run();
  const headers=new Headers();headers.append('set-cookie',secureCookie(SESSION_COOKIE,session,SESSION_SECONDS));headers.append('set-cookie',secureCookie(GOOGLE_NONCE_COOKIE,'',0));
  return json({ok:true,account:publicAccount(account)},200,headers);
}

async function handleVerify(request:Request,env:AuthEnv):Promise<Response> {
  const token=new URL(request.url).searchParams.get('token') ?? '';
  const redirect=(state:string)=>new Response(null,{status:303,headers:{location:`${originFor(request,env)}/account?verified=${state}`,'referrer-policy':'no-referrer','cache-control':'no-store'}});
  if(!/^[a-f0-9]{64}$/.test(token))return redirect('invalid');
  const hash=await sha256(token),now=new Date().toISOString();
  const verification=await env.DB.prepare("SELECT account_id,password_hash,password_salt,purpose FROM email_verifications WHERE token_hash=? AND expires_at>? AND purpose='verify'").bind(hash,now).first<Verification>();
  if(!verification)return redirect('expired');
  const result=await env.DB.batch([
    env.DB.prepare(`UPDATE accounts SET email_verified_at=?,password_hash=?,password_salt=?,google_sub=CASE WHEN ? IS NOT NULL THEN NULL ELSE google_sub END
      WHERE id=? AND email_verified_at IS NULL AND EXISTS(SELECT 1 FROM email_verifications WHERE token_hash=? AND expires_at>? AND purpose='verify')`)
      .bind(now,verification.password_hash,verification.password_salt,verification.password_hash,verification.account_id,hash,now),
    env.DB.prepare('DELETE FROM email_verifications WHERE account_id=? AND changes()=1').bind(verification.account_id),
    env.DB.prepare('UPDATE submissions SET account_id=? WHERE account_id IS NULL AND email=(SELECT email FROM accounts WHERE id=? AND email_verified_at IS NOT NULL)')
      .bind(verification.account_id,verification.account_id),
    env.DB.prepare("UPDATE notification_outbox SET state='cancelled' WHERE state='queued' AND kind='verify' AND json_extract(payload_json,'$.accountId')=?").bind(verification.account_id),
  ]);
  return redirect(result[0].meta.changes?'success':'expired');
}

async function handleResend(request:Request,env:AuthEnv,purpose:'verify'|'reset'):Promise<Response> {
  requireOrigin(request);const input=await jsonBody(request),email=inputEmail(input);
  if(!await authLimit(request,env.DB,purpose==='verify'?'resend':'reset-request',email,3,15))return json({error:'try-later'},429);
  const account=await byEmail(env,email);
  if(account && (purpose==='reset'?!!account.email_verified_at:!account.email_verified_at)) {
    let pending:{hash:string;salt:string}|undefined;
    if(purpose==='verify') {
      const last=await env.DB.prepare("SELECT password_hash,password_salt FROM email_verifications WHERE account_id=? AND purpose='verify' ORDER BY created_at DESC LIMIT 1").bind(account.id).first<{password_hash:string|null;password_salt:string|null}>();
      if(last?.password_hash&&last.password_salt)pending={hash:last.password_hash,salt:last.password_salt};
      if(!pending&&!account.google_sub)return json({ok:true,message:'check-email'},202);
    }
    await issueVerification(request,env,account,purpose,pending);
  }
  return json({ok:true,message:'check-email'},202);
}

async function handleReset(request:Request,env:AuthEnv):Promise<Response> {
  requireOrigin(request);const input=await jsonBody(request),password=inputPassword(input),token=typeof input.token==='string'?input.token:'';
  if(!/^[a-f0-9]{64}$/.test(token))return json({error:'invalid-reset'},400);
  const hash=await sha256(token);
  if(!await authLimit(request,env.DB,'reset-complete',hash,5,20))return json({error:'try-later'},429);
  const now=new Date().toISOString();
  const verification=await env.DB.prepare("SELECT account_id FROM email_verifications WHERE token_hash=? AND expires_at>? AND purpose='reset'").bind(hash,now).first<{account_id:string}>();
  if(!verification)return json({error:'invalid-reset'},400);
  const salt=randomToken().slice(0,32),passwordHash=await derivePassword(password,salt);
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE accounts SET password_hash=?,password_salt=? WHERE id=? AND email_verified_at IS NOT NULL
      AND EXISTS(SELECT 1 FROM email_verifications WHERE token_hash=? AND purpose='reset' AND expires_at>?)`)
      .bind(passwordHash,salt,verification.account_id,hash,now),
    env.DB.prepare('DELETE FROM email_verifications WHERE account_id=? AND changes()=1').bind(verification.account_id),
    env.DB.prepare('DELETE FROM auth_sessions WHERE account_id=? AND changes()>0').bind(verification.account_id),
    env.DB.prepare("UPDATE notification_outbox SET state='cancelled' WHERE state='queued' AND kind='reset' AND json_extract(payload_json,'$.accountId')=?").bind(verification.account_id),
  ]);
  return results[0].meta.changes?json({ok:true,message:'password-updated'},200,{'set-cookie':secureCookie(SESSION_COOKIE,'',0)}):json({error:'invalid-reset'},400);
}

export async function handleAuth(request:Request,env:AuthEnv):Promise<Response|null> {
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/api/auth/'))return null;
  if(path==='/api/auth/config'&&request.method==='GET') {
    const nonce=randomToken();return json({googleClientId:env.GOOGLE_CLIENT_ID ?? '',nonce},200,{'set-cookie':secureCookie(GOOGLE_NONCE_COOKIE,nonce,600)});
  }
  if(path==='/api/auth/me'&&request.method==='GET') { const account=await getSessionAccount(request,env);return json({account:account?publicAccount(account):null}); }
  if(path==='/api/auth/verify'&&request.method==='GET')return handleVerify(request,env);
  if(request.method!=='POST')return json({error:'method-not-allowed'},405);
  if(path==='/api/auth/register')return handleRegister(request,env);
  if(path==='/api/auth/login')return handleLogin(request,env);
  if(path==='/api/auth/google')return handleGoogle(request,env);
  if(path==='/api/auth/resend')return handleResend(request,env,'verify');
  if(path==='/api/auth/reset/request')return handleResend(request,env,'reset');
  if(path==='/api/auth/reset/complete')return handleReset(request,env);
  if(path==='/api/auth/logout'||path==='/api/auth/sessions/revoke') {
    requireOrigin(request);
    const account=path.endsWith('/revoke')?await getSessionAccount(request,env):null;
    if(path.endsWith('/revoke')&&!account)return json({error:'sign-in-required'},401);
    const token=readCookie(request,SESSION_COOKIE);
    if(account)await env.DB.prepare('DELETE FROM auth_sessions WHERE account_id=?').bind(account.id).run();
    else if(token&&/^[a-f0-9]{64}$/.test(token))await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await sha256(token)).run();
    return json({ok:true},200,{'set-cookie':secureCookie(SESSION_COOKIE,'',0)});
  }
  return json({error:'not-found'},404);
}
