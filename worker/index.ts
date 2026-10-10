import { handleScreenshot } from './screenshots.ts';
import { handleAuth } from './auth.ts';
import { handleApiCredential } from './api-credentials.ts';
import { handleAdmin } from './admin.ts';
import { handleSubmit,handleMySubmissions,mutateSubmission,requestCorrection } from './submissions.ts';
import { issueVoter,handleStars } from './stars.ts';
import { accountProjects } from './account-projects.ts';
import { dispatchOutbox,cleanupState } from './outbox.ts';
import { CatalogRepository } from './catalog.ts';
import { handlePublic } from './public.ts';
import { HttpError,json } from './http.ts';
import type { Env } from './env.ts';
export type { Env } from './env.ts';
const PUBLIC_ROUTE=/^(?:\/$|\/(?:tools|new|category|tool|compare|collections|updates)(?:\/|$)|\/api\/content$|\/rss\.xml$|\/sitemap(?:-pages|-tools(?:-\d+)?)?\.xml$)/;
async function publicResponse(request:Request,env:Env,ctx:ExecutionContext):Promise<Response|null> {
 const url=new URL(request.url);if(!PUBLIC_ROUTE.test(url.pathname))return null;
 const card=/^\/tool\/([a-z0-9-]+)\/card\.(svg|png)$/.exec(url.pathname);
 const version=await new CatalogRepository(env.DB).version();
 const key=new URL(url.origin+`/__wmcache/${env.RELEASE_REVISION ?? 'local'}/${version.version}/${card?0:version.starVersion}/${card?'card':Math.floor(Date.now()/60000)}`+url.pathname);
 for(const name of ['q','category','pricing','origin','sort','cursor','page','limit','slugs','week','v','view'])if(url.searchParams.has(name))key.searchParams.set(name,url.searchParams.get(name)!);
 key.searchParams.sort();
 const cache=typeof caches==='undefined'?undefined:caches.default;
 let response=await cache?.match(new Request(key));
 if(!response) {
  response=card?await (await import('./cards.ts')).cardResponse(request,env,card[1],card[2]):await handlePublic(request,env) ?? undefined;
  if(!response)return null;
  if(response.status===200) {
   const headers=new Headers(response.headers);headers.set('cache-control','public, max-age=0, s-maxage=60');
   const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key.href));
   headers.set('etag','"'+Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32)+'"');
   headers.set('x-catalog-version',String(version.version));
   response=new Response(response.body,{status:response.status,headers});
   if(cache)ctx.waitUntil(cache.put(new Request(key),response.clone()).catch(()=>{}));
  }
 }
 if(response.headers.has('etag')&&request.headers.get('if-none-match')===response.headers.get('etag'))return new Response(null,{status:304,headers:response.headers});
 return response;
}
async function route(request:Request,env:Env,ctx:ExecutionContext):Promise<Response> {
 const path=new URL(request.url).pathname;
 if(path==='/api/token')return handleApiCredential(request,env);
 if(path.startsWith('/api/admin/'))return handleAdmin(request,env);
 if(path.startsWith('/api/auth/'))return await handleAuth(request,env) ?? json({error:'not-found'},404);
 const screenshot=/^\/api\/product-screenshots\/([^/]+)$/.exec(path);if(screenshot)return handleScreenshot(request,env,screenshot[1]);
 if(path==='/api/submit')return handleSubmit(request,env);
 if(path==='/api/stars/identity')return issueVoter(request,env);
 if(path==='/api/stars')return handleStars(request,env);
 if(path==='/api/account/submissions')return handleMySubmissions(request,env);
 const submission=/^\/api\/account\/submissions\/(\d+)$/.exec(path);
 if(submission){const id=Number(submission[1]);if(!Number.isSafeInteger(id)||id<1)throw new HttpError('submission-not-found',404);return mutateSubmission(request,env,id);}
 const projects=/^\/api\/account\/projects(?:\/([a-z0-9-]+))?$/.exec(path);if(projects)return accountProjects(request,env,projects[1]);
 const correction=/^\/api\/account\/corrections\/([a-z0-9-]+)$/.exec(path);if(correction)return requestCorrection(request,env,correction[1]);
 if(!['GET','HEAD'].includes(request.method))return json({error:'method-not-allowed'},405,{'allow':'GET, HEAD'});
 const publicPage=await publicResponse(request,env,ctx);if(publicPage)return publicPage;
 if(path.startsWith('/api/'))return json({error:'not-found'},404);
 return env.ASSETS.fetch(request);
}
export default {
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response> {
  try {
   if(new URL(request.url).href.length>8000)throw new HttpError('url-too-long',414);
   const response=await route(request,env,ctx);
   if(response.status<400&&(['POST','PUT','PATCH','DELETE'].includes(request.method)||new URL(request.url).pathname==='/api/auth/verify'))ctx.waitUntil(dispatchOutbox(env,10).catch(error=>console.error('outbox-dispatch-failed',error instanceof Error?error.name:'error')));
   const headers=new Headers(response.headers);if(env.RELEASE_REVISION)headers.set('x-release-revision',env.RELEASE_REVISION);
   return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
  } catch(error) {
   if(error instanceof HttpError)return json({error:error.code},error.status);
   console.error('request-failed',error instanceof Error?error.name:'error');return json({error:'temporarily-unavailable'},503);
  }
 },
 async scheduled(_event:ScheduledController,env:Env,ctx:ExecutionContext):Promise<void> {ctx.waitUntil((async()=>{await cleanupState(env.DB);await dispatchOutbox(env,50);})());},
} satisfies ExportedHandler<Env>;
