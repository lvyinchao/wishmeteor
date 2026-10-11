import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { ListToolsRequestSchema,CallToolRequestSchema,type Tool,type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { HttpError,json,jsonBody } from '../http.ts';
import { consumeLimits,requestIp } from '../security.ts';
import { principal,authenticateHeader,type Principal } from './oauth.ts';
import { getAccount,checkDuplicate,submitListing,getSubmission,checkSitemap } from './services.ts';
import type { Env } from '../env.ts';
const string=(max=2048)=>z.string().min(1).max(max);
const duplicate={official_url:string(),name:string(80),aliases:z.array(string(120)).max(8).optional()};
const key=z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
export const schemas={
 get_account:z.object({}).strict(),
 check_duplicate:z.object(duplicate).strict(),
 submit_listing:z.object({...duplicate,category:string(40),description:z.string().trim().min(300).max(600),source_links:z.array(string()).min(1).max(10),listing_identity:z.enum(['owner','authorized_independent']),idempotency_key:key,
 screenshot:z.object({download_url:string(8192),file_id:string(200),mime_type:z.string().max(100).optional(),file_name:z.string().max(255).optional()}).strict()}).strict(),
 get_submission:z.object({submission_id:z.number().int().positive().optional(),idempotency_key:key.optional()}).strict().refine(v=>!!v.submission_id!==!!v.idempotency_key),
 check_sitemap:z.object({public_url:string()}).strict()
};
type Name=keyof typeof schemas;
const permissions:Record<Name,string>={get_account:'account:read',check_duplicate:'submissions:read',submit_listing:'submissions:write',get_submission:'submissions:read',check_sitemap:'sitemap:read'};
const descriptions:Record<Name,string>={
 get_account:'Read the authorized WishMeteor account, scopes, current submission limits and content/screenshot requirements. Never returns credentials.',
 check_duplicate:'Search published WishMeteor listings and this account’s pending submissions by normalized official URL, product name and aliases. Shared hosting projects use project paths. Returns match reasons, record IDs, states and public links.',
 submit_listing:'After explicit user authorization, submit an original 300–600 character introduction with sources and a real PNG/JPEG/WebP screenshot (maximum 5 MiB). This can PUBLICLY PUBLISH immediately for trusted accounts, otherwise queues review. authorized_independent means permission to independently list a product, not ownership of its domain. Use a stable unique idempotency_key; after timeout query get_submission by that key before retrying. Same key and same content creates only one record. Do not put credentials in inputs.',
 get_submission:'Reread this authorized account’s actual stored submission by submission_id OR idempotency_key, including review/publication status, public URL, saved introduction and actual screenshot existence. Use the key to resolve a timed-out submission.',
 check_sitemap:'Verify a WishMeteor public listing and whether its URL appears in the current automatically generated sitemap. Sitemap presence does NOT establish Google indexing. No administrator update action.'
};
export function toolDescriptors():Tool[] {
 return (Object.keys(schemas) as Name[]).map(name=>{const schema=z.toJSONSchema(schemas[name],{unrepresentable:'any'}) as Tool['inputSchema'];return {name,title:name.replaceAll('_',' '),description:descriptions[name],inputSchema:schema,annotations:{readOnlyHint:name!=='submit_listing',destructiveHint:false,idempotentHint:true,openWorldHint:name==='submit_listing'},_meta:{securitySchemes:[{type:'oauth2',scopes:[permissions[name]]}],...(name==='submit_listing'?{'openai/fileParams':['screenshot']}: {})},securitySchemes:[{type:'oauth2',scopes:[permissions[name]]}]} as Tool;});
}
function result(data:Record<string,unknown>):CallToolResult{return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};}
function errorResult(env:Env,error:HttpError):CallToolResult {
 const status=error.status,category=status===401?'authentication_expired':status===403?'permission_denied':status===409?'conflict':status===429?'rate_limited':status>=500?'server_error':status===404?'not_found':'validation_error';
 return {...result({error:{code:error.code,category,http_status:status,retryable:status===429||status>=500,...(status===429?{retry_after_seconds:3600}:{})}}),isError:true,...(status===401||status===403?{_meta:{'mcp/www_authenticate':[authenticateHeader(env,status===403?'insufficient_scope':'invalid_token')]}}:{})};
}
export async function invokeTool(request:Request,env:Env,name:string,input:unknown):Promise<CallToolResult> {
 if(!Object.hasOwn(schemas,name))return errorResult(env,new HttpError('unknown-tool',404));
 const tool=name as Name,auth=await principal(request,env);if(!auth)return errorResult(env,new HttpError('authentication-expired',401));
 if(!auth.scopes.includes(permissions[tool]))return errorResult(env,new HttpError('insufficient-scope',403));
 const parsed=schemas[tool].safeParse(input);if(!parsed.success)return errorResult(env,new HttpError('invalid-fields'));
 try {
  switch(tool) {
   case 'get_account':return result(await getAccount(env,auth));
   case 'check_duplicate':return result(await checkDuplicate(env,auth,parsed.data as z.infer<typeof schemas.check_duplicate>));
   case 'submit_listing':return result(await submitListing(request,env,auth,parsed.data as z.infer<typeof schemas.submit_listing>));
   case 'get_submission':return result(await getSubmission(env,auth,parsed.data as z.infer<typeof schemas.get_submission>));
   case 'check_sitemap':return result(await checkSitemap(env,parsed.data as z.infer<typeof schemas.check_sitemap>));
  }
 }catch(error){return errorResult(env,error instanceof HttpError?error:new HttpError('temporarily-unavailable',503));}
}
export async function handleMcp(request:Request,env:Env):Promise<Response> {
 const origin=request.headers.get('origin');if(origin&&!['https://chatgpt.com',env.APP_ORIGIN ?? 'https://wishmeteor.net'].includes(origin))return json({error:'origin-not-allowed'},403);
 if(!['POST','GET','DELETE'].includes(request.method))return json({error:'method-not-allowed'},405);
 // Public discovery is permitted, but every tool requires its own scoped grant.
 if(request.headers.has('authorization')&&!await principal(request,env))return json({error:'invalid_token'},401,{'www-authenticate':authenticateHeader(env)});
 if(!await consumeLimits(env.DB,'mcp-request',[{key:requestIp(request),maximum:600,windowMs:60_000}]))return json({error:'rate_limited'},429,{'retry-after':'60'});
 let parsedBody:Record<string,unknown>|undefined;
 if(request.method==='POST')try{parsedBody=await jsonBody(request,32_768);}catch(error){return json({error:error instanceof HttpError?error.code:'invalid-request'},400);}
 const server=new Server({name:'WishMeteor',version:'1.0.0'},{capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:toolDescriptors()}));
 server.setRequestHandler(CallToolRequestSchema,async({params})=>invokeTool(request,env,params.name,params.arguments ?? {}));
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);
 try{return await transport.handleRequest(request,{parsedBody});}finally{await server.close();}
}
