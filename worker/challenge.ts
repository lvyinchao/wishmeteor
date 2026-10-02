import type { Env } from './env.ts';
import { requestIp } from './security.ts';
export function challengeConfigured(env:Env):boolean {
 const origin=new URL(env.APP_ORIGIN ?? 'https://wishmeteor.net');
 const hostnames=(env.TURNSTILE_HOSTNAMES ?? '').split(',').map(s=>s.trim()).filter(Boolean);
 return !!(env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET&&hostnames.includes(origin.hostname)
  && (origin.protocol==='http:'||!hostnames.some(h=>['localhost','127.0.0.1'].includes(h))));
}
export async function verifyChallenge(request:Request,env:Env,token:unknown):Promise<boolean> {
 if(!challengeConfigured(env)||typeof token!=='string'||!token||token.length>2048)return false;
 try {
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:env.TURNSTILE_SECRET!,response:token,remoteip:requestIp(request)}),signal:AbortSignal.timeout(8000)});
  const result=await response.json() as {success?:boolean;action?:string;hostname?:string};
  const hosts=(env.TURNSTILE_HOSTNAMES ?? '').split(',').map(s=>s.trim());
  return response.ok&&result.success===true&&result.action==='star_identity'&&typeof result.hostname==='string'&&hosts.includes(result.hostname);
 }catch{return false;}
}
