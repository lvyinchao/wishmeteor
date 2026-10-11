import { boundedBytes,HttpError } from '../http.ts';
import { SCREENSHOT_MAX,validateScreenshot } from '../screenshots.ts';
export interface OpenAIFile {download_url:string;file_id:string;mime_type?:string;file_name?:string}
export function allowedFileUrl(raw:string):boolean {
 try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&u.href.length<=8192&&(u.hostname==='files.openai.com'||u.hostname==='files.oaiusercontent.com'||u.hostname.endsWith('.oaiusercontent.com'));}catch{return false;}
}
export async function downloadScreenshot(file:OpenAIFile):Promise<File> {
 if(!allowedFileUrl(file.download_url))throw new HttpError('screenshot-url-not-allowed');
 let response:Response;
 try{response=await fetch(file.download_url,{redirect:'error',signal:AbortSignal.timeout(15_000),headers:{accept:'image/png,image/jpeg,image/webp'}});}catch{throw new HttpError('screenshot-download-failed',502);}
 if(!response.ok)throw new HttpError('screenshot-download-failed',502);
 const mime=(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
 if(!['image/png','image/jpeg','image/webp'].includes(mime)||(file.mime_type&&file.mime_type!==mime))throw new HttpError('screenshot-invalid');
 let bytes:Uint8Array;
 try{bytes=await boundedBytes(new Request('https://internal.invalid',{method:'POST',body:response.body,headers:response.headers,duplex:'half'} as RequestInit),SCREENSHOT_MAX);}catch(error){if(error instanceof HttpError)throw new HttpError('screenshot-too-large',413);throw new HttpError('screenshot-download-failed',502);}
 const screenshot=new File([bytes],'screenshot',{type:mime});await validateScreenshot(screenshot);return screenshot;
}
