import { getSessionAccount } from './auth.ts';
import { HttpError,json } from './http.ts';
import type { Env } from './env.ts';
export const SCREENSHOT_MAX=5*1024*1024;
export const SCREENSHOT_KEY=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|webp)$/;
export const screenshotPath=(key:string)=>'/api/product-screenshots/'+key;
export async function validateScreenshot(file:unknown):Promise<{bytes:Uint8Array;type:string;extension:string}> {
  if(!(file instanceof File)||!file.size)throw new HttpError('screenshot-required');
  if(file.size>SCREENSHOT_MAX)throw new HttpError('screenshot-too-large',413);
  const b=new Uint8Array(await file.arrayBuffer()),ascii=(start:number,end:number)=>String.fromCharCode(...b.subarray(start,end));
  let type='',extension='';
  if(b.length>=45&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)&&ascii(12,16)==='IHDR'&&ascii(b.length-8,b.length-4)==='IEND') {type='image/png';extension='png';}
  else if(b.length>=32&&b[0]===255&&b[1]===216&&b[2]===255&&b[b.length-2]===255&&b[b.length-1]===217){type='image/jpeg';extension='jpg';}
  else if(b.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(ascii(12,16))&&new DataView(b.buffer).getUint32(4,true)+8===b.length){type='image/webp';extension='webp';}
  if(!type||file.type!==type)throw new HttpError('screenshot-invalid');
  return {bytes:b,type,extension};
}
export async function screenshotResponse(request:Request,env:Env,key:string,publicImage=false):Promise<Response> {
  if(!SCREENSHOT_KEY.test(key))return json({error:'screenshot-not-found'},404);
  const object=await env.PRODUCT_SCREENSHOTS.get(key);if(!object)return json({error:'screenshot-not-found'},404);
  const headers=new Headers({'cache-control':publicImage?'public, max-age=0, must-revalidate':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'",'etag':object.httpEtag});
  object.writeHttpMetadata(headers);
  if(request.headers.get('if-none-match')===object.httpEtag)return new Response(null,{status:304,headers});
  return new Response(request.method==='HEAD'?null:object.body,{headers});
}
export async function handleScreenshot(request:Request,env:Env,key:string):Promise<Response> {
  if(!['GET','HEAD'].includes(request.method))return json({error:'method-not-allowed'},405);
  if(!SCREENSHOT_KEY.test(key))return json({error:'screenshot-not-found'},404);
  const row=await env.DB.prepare(`SELECT s.account_id,CASE WHEN s.verdict='approved' AND t.approved=1 AND t.status!='archived' AND json_extract(t.content_json,'$.coverImage')=? THEN 1 ELSE 0 END AS visible
    FROM submissions s LEFT JOIN managed_tools t ON t.slug=s.approved_slug WHERE s.screenshot_key=?`).bind(screenshotPath(key),key).first<{account_id:string|null;visible:number}>();
  if(!row)return json({error:'screenshot-not-found'},404);
  if(!row.visible){const account=await getSessionAccount(request,env);if(!account||account.id!==row.account_id)return json({error:'screenshot-not-found'},404);}
  return screenshotResponse(request,env,key,!!row.visible);
}
