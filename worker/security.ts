const encoder = new TextEncoder();
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256',encoder.encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2,'0')).join('');
}
export function randomToken(): string { return [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2,'0')).join(''); }
export function constantTimeEqual(a: string,b: string): boolean {
  const left=encoder.encode(a),right=encoder.encode(b);
  let result=left.length ^ right.length;
  for(let i=0;i<Math.max(left.length,right.length);i++) result |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return result === 0;
}
export function readCookie(request: Request,name: string): string | null {
  return (request.headers.get('cookie') ?? '').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1) ?? null;
}
export function secureCookie(name: string,value: string,seconds: number): string { return `${name}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`; }
export function requestIp(request: Request): string { return request.headers.get('cf-connecting-ip') ?? 'local'; }

interface RateRule { key: string; maximum: number; windowMs?: number }
export async function consumeLimits(db: D1Database,action: string,rules: RateRule[],now=Date.now()): Promise<boolean> {
  const keys=await Promise.all(rules.map(rule=>sha256(`wm-rate:${action}:${rule.key}`)));
  const statements=rules.map((rule,i)=> {
    const window=rule.windowMs ?? 3_600_000;
    return db.prepare(`INSERT INTO auth_rate_limits(rate_key,window_start,count,expires_at) VALUES(?,?,1,?)
      ON CONFLICT(rate_key) DO UPDATE SET
      count=CASE WHEN auth_rate_limits.window_start <= ? THEN 1 ELSE MIN(auth_rate_limits.count+1,?) END,
      window_start=CASE WHEN auth_rate_limits.window_start <= ? THEN excluded.window_start ELSE auth_rate_limits.window_start END,
      expires_at=CASE WHEN auth_rate_limits.window_start <= ? THEN excluded.expires_at ELSE auth_rate_limits.expires_at END`)
      .bind(keys[i],now,now+window,now-window,rule.maximum+1,now-window,now-window);
  });
  statements.push(db.prepare(`SELECT rate_key,count FROM auth_rate_limits WHERE rate_key IN (${keys.map(()=>'?').join(',')})`).bind(...keys));
  const result=await db.batch(statements);
  const counts=new Map((result.at(-1)?.results as {rate_key:string;count:number}[] ?? []).map(r=>[r.rate_key,r.count]));
  return rules.every((rule,i)=>(counts.get(keys[i]) ?? rule.maximum+1)<=rule.maximum);
}

export async function authLimit(request: Request,db: D1Database,action: string,identity: string,maximum: number,ipMaximum=40): Promise<boolean> {
  return consumeLimits(db,action,[{key:`ip:${requestIp(request)}`,maximum:ipMaximum},{key:`identity:${identity}`,maximum},{key:'global',maximum:2000}]);
}
