import { SLUG_RE } from '../src/lib/tool-schema.ts';
import { json,jsonBody,requireOrigin } from './http.ts';
import { consumeLimits,randomToken,readCookie,requestIp,secureCookie,sha256 } from './security.ts';
import { challengeConfigured,verifyChallenge } from './challenge.ts';
import type { Env } from './env.ts';
const VOTER_COOKIE='__Host-wm_voter';
const TTL=365*24*60*60;

async function identity(request:Request,env:Env):Promise<string|null> {
  const token=readCookie(request,VOTER_COOKIE);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const hash=await sha256(token);
  return await env.DB.prepare('SELECT token_hash FROM anonymous_voters WHERE token_hash=? AND expires_at>?').bind(hash,new Date().toISOString()).first()?hash:null;
}
export async function issueVoter(request:Request,env:Env):Promise<Response> {
  if(request.method!=='POST')return json({error:'method-not-allowed'},405);requireOrigin(request);
  if(await identity(request,env))return json({ok:true});
  const input=await jsonBody(request,4096);
  if(!await consumeLimits(env.DB,'voter-identity',[{key:'ip:'+requestIp(request),maximum:10,windowMs:86_400_000},{key:'global',maximum:10_000,windowMs:86_400_000}])) {
    if(!challengeConfigured(env))return json({error:'try-later'},429);
    if(!input.challengeToken)return json({error:'challenge-required',siteKey:env.TURNSTILE_SITE_KEY},429);
    if(!await consumeLimits(env.DB,'voter-challenge',[{key:'ip:'+requestIp(request),maximum:3},{key:'global',maximum:1000}]))return json({error:'try-later'},429);
    if(!await verifyChallenge(request,env,input.challengeToken))return json({error:'challenge-failed'},403);
  }
  const token=randomToken(),now=new Date();
  await env.DB.prepare('INSERT INTO anonymous_voters(token_hash,created_at,expires_at) VALUES(?,?,?)').bind(await sha256(token),now.toISOString(),new Date(now.getTime()+TTL*1000).toISOString()).run();
  return json({ok:true},200,{'set-cookie':secureCookie(VOTER_COOKIE,token,TTL)});
}
export async function handleStars(request:Request,env:Env):Promise<Response> {
  if(request.method==='GET') {
    const raw=new URL(request.url).searchParams.get('slugs') ?? '';if(raw.length>5000)return json({error:'too-many-slugs'},400);
    const slugs=[...new Set(raw.split(','))].filter(s=>SLUG_RE.test(s)&&s.length<=100).slice(0,40);if(!slugs.length)return json({counts:{},lit:[]});
    const hash=await identity(request,env),placeholders=slugs.map(()=>'?').join(',');
    const rows=await env.DB.prepare(`SELECT t.slug,t.star_count,EXISTS(SELECT 1 FROM wish_stars s WHERE s.slug=t.slug AND s.voter_hash=?) AS lit
      FROM managed_tools t WHERE t.approved=1 AND t.status!='archived' AND t.slug IN (${placeholders})`).bind(hash ?? '',...slugs).all<{slug:string;star_count:number;lit:number}>();
    return json({counts:Object.fromEntries((rows.results ?? []).map(r=>[r.slug,r.star_count])),lit:(rows.results ?? []).filter(r=>r.lit).map(r=>r.slug)});
  }
  if(request.method!=='POST')return json({error:'method-not-allowed'},405);
  requireOrigin(request);const input=await jsonBody(request,2048),slug=typeof input.slug==='string'?input.slug:'';
  if(!SLUG_RE.test(slug)||slug.length>100)return json({error:'invalid-star'},400);
  const hash=await identity(request,env);if(!hash)return json({error:'anonymous-identity-required'},409);
  if(!await consumeLimits(env.DB,'star',[{key:'ip:'+requestIp(request),maximum:60},{key:'voter:'+hash,maximum:40}]))return json({error:'try-later'},429);
  const now=new Date().toISOString();
  const rows=await env.DB.batch([
    env.DB.prepare(`INSERT INTO wish_stars(slug,voter_hash,created_at,verified_browser)
      SELECT ?,?,?,1 WHERE EXISTS(SELECT 1 FROM managed_tools WHERE slug=? AND approved=1 AND status!='archived')
      AND EXISTS(SELECT 1 FROM anonymous_voters WHERE token_hash=? AND expires_at>?) ON CONFLICT(slug,voter_hash) DO NOTHING`).bind(slug,hash,now,slug,hash,now),
    env.DB.prepare("SELECT star_count FROM managed_tools WHERE slug=? AND approved=1 AND status!='archived'").bind(slug),
  ]);
  const count=(rows[1].results as {star_count:number}[])[0];if(!count)return json({error:'wish-not-found'},404);
  return json({count:count.star_count,alreadyLit:!rows[0].meta.changes});
}
