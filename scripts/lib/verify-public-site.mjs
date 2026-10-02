import https from 'node:https';
import { isIP } from 'node:net';
import { canonicalVerificationUrl } from '../../src/lib/verification.mjs';

export function publicAddress(address) {
  // IPv6 is conservatively restricted to ordinary global unicast; mapped IPv4,
  // NAT64, Teredo, 6to4, documentation, local and reserved ranges fail closed.
  if (isIP(address) === 6) {
    const first = parseInt(address.split(':')[0], 16);
    return first >= 0x2000 && first <= 0x3fff && first !== 0x2001 && first !== 0x2002
      && !address.includes('.') && !address.toLowerCase().startsWith('3fff:');
  }
  if (isIP(address) !== 4) return false;
  const [a,b,c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || b === 0)) || (a === 192 && b === 88 && c === 99)
    || (a === 198 && [18,19].includes(b)) || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113));
}

export async function resolvePublicDns(hostname, _options, signal) {
  const answers = await Promise.all(['A','AAAA'].map(async type => {
    const endpoint = new URL('https://cloudflare-dns.com/dns-query');
    endpoint.searchParams.set('name',hostname); endpoint.searchParams.set('type',type);
    // Fixed trusted resolver only; target hosts never reach fetch directly.
    const response = await fetch(endpoint,{headers:{accept:'application/dns-json'},redirect:'error',signal});
    if(!response.ok || !response.body) throw new Error('dns-failed');
    const reader=response.body.getReader();let body='';
    try {const decoder=new TextDecoder();for(;;){const {done,value}=await reader.read();if(done)break;body+=decoder.decode(value,{stream:true});if(body.length>16384)throw new Error('dns-too-large');}}
    finally {await reader.cancel();}
    const result=JSON.parse(body);
    if(result.Status!==0)throw new Error('dns-failed');
    return (result.Answer??[]).filter(answer=>[1,28].includes(answer.type)).map(answer=>({address:answer.data,family:answer.type===1?4:6}));
  }));
  return answers.flat();
}

export async function pinnedRequest(url, method, signal, resolve = resolvePublicDns, request = https.request) {
  const addresses = await resolve(url.hostname, {all:true, verbatim:true}, signal);
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(({address}) => !publicAddress(address))) throw new Error('unsafe-dns');
  const chosen = addresses.find(({family}) => family === 4) ?? addresses[0];
  return await new Promise((resolveResponse, reject) => {
    const req = request(url, {method, signal, agent:false, servername:url.hostname, rejectUnauthorized:true,
      // Pin the checked address for the actual connection, preventing DNS rebinding.
      lookup:(_host, options, callback) => options?.all
        ? callback(null, [chosen]) : callback(null, chosen.address, chosen.family),
      headers:{'user-agent':'WishMeteorVerifier/1.0 (+https://wishmeteor.net/about)',accept:'text/html,application/xhtml+xml'}},
      (response) => {
        const result = {status:response.statusCode ?? 0, location:response.headers.location,
          contentType:response.headers['content-type'] ?? ''};
        // Headers establish reachability. Do not download unbounded response bodies.
        response.destroy(); resolveResponse(result);
      });
    req.on('error',reject); req.end();
  });
}

export async function verifyPublicSite(raw, probe = pinnedRequest) {
  const signal = AbortSignal.timeout(15_000);
  let url = new URL(canonicalVerificationUrl(raw));
  for (let hop=0; hop<=4; hop++) {
    signal.throwIfAborted();
    let result = await probe(url,'HEAD',signal);
    if ([405,501].includes(result.status)) result = await probe(url,'GET',signal);
    if (result.status >= 200 && result.status < 300 && /^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(result.contentType))
      return {url:canonicalVerificationUrl(raw), finalUrl:canonicalVerificationUrl(url.href),state:'live',httpStatus:result.status};
    if (![301,302,303,307,308].includes(result.status) || !result.location || hop===4) return {url:canonicalVerificationUrl(raw),state:[404,410].includes(result.status)?'dead':'blocked',httpStatus:result.status};
    url = new URL(canonicalVerificationUrl(new URL(result.location,url).href));
  }
  throw new Error('too-many-redirects');
}

export async function inspectPublicSite(raw,probe=pinnedRequest) {
 const url=canonicalVerificationUrl(raw);
 try{return await verifyPublicSite(url,probe);}catch(error){return {url,state:['ENOTFOUND','ECONNREFUSED'].includes(error.code)?'dead':'blocked',httpStatus:0,reason:error.message==='unsafe-dns'?'unsafe-dns':'check-unavailable'};}
}
