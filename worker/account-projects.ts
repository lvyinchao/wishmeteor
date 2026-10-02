import { CatalogRepository,summarize } from './catalog.ts';
import { getSessionAccount } from './auth.ts';
import { json,jsonBody,requireOrigin } from './http.ts';
import type { Env } from './env.ts';

export async function accountProjects(request:Request,env:Env,slug?:string):Promise<Response> {
  const account=await getSessionAccount(request,env);if(!account)return json({error:'sign-in-required'},401);
  if(!slug&&request.method==='GET') {
    const rows=await env.DB.prepare(`SELECT p.slug,p.bookmarked,p.following,json_remove(t.content_json,'$.description','$.sources','$.wish.blessingLong') AS content_json,t.star_count,length(json_extract(t.content_json,'$.description')) AS description_length,t.trusted_star_count,t.published_at,t.updated_at
      FROM account_projects p JOIN managed_tools t ON t.slug=p.slug WHERE p.account_id=? AND (p.bookmarked=1 OR p.following=1)
      AND t.approved=1 AND t.status!='archived' ORDER BY p.updated_at DESC LIMIT 100`).bind(account.id).all<{slug:string;bookmarked:number;following:number;content_json:string;star_count:number;description_length:number;trusted_star_count:number;published_at:string;updated_at:string}>();
    return json({projects:(rows.results ?? []).map(row=>({tool:summarize({...JSON.parse(row.content_json),publishedAt:row.published_at,updatedAt:row.updated_at},row.star_count,row.description_length,row.trusted_star_count),bookmarked:row.bookmarked===1,following:row.following===1}))});
  }
  if(!slug||request.method!=='PUT')return json({error:'method-not-allowed'},405);requireOrigin(request);
  const tool=await new CatalogRepository(env.DB).get(slug);if(!tool)return json({error:'product-not-found'},404);
  const input=await jsonBody(request);if(typeof input.bookmarked!=='boolean'||typeof input.following!=='boolean')return json({error:'invalid-input'},400);
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO account_projects(account_id,slug,bookmarked,following,created_at,updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(account_id,slug) DO UPDATE SET bookmarked=excluded.bookmarked,following=excluded.following,updated_at=excluded.updated_at`)
    .bind(account.id,slug,input.bookmarked?1:0,input.following?1:0,now,now).run();
  return json({ok:true,bookmarked:input.bookmarked,following:input.following});
}
