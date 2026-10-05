import test from 'node:test';
import assert from 'node:assert/strict';
import { environment,submit } from './harness.mjs';
import { tool,store,call,admin } from './fixtures.mjs';
import { isDofollow,outboundRel } from '../src/lib/link-policy.ts';
import { validateTool } from '../src/lib/tool-schema.ts';

test('an editor can approve a legacy official link without fabricating checks or changing its content',async()=>{
 const env=environment();env.EMAIL=undefined;
 const original=tool('legacy-link',{origin:'submitted',wish:undefined,lastVerifiedAt:null,checksFailed:2});store(env,original);
 const path='/api/admin/content/legacy-link/link-policy',input={linkPolicy:'dofollow',expectedVersion:original.contentVersion};
 assert.equal((await call(env,path,input)).status,401);
 assert.equal((await admin(env,path,{...input,expectedVersion:'old'})).status,428);
 const response=await admin(env,path,input);assert.equal(response.status,200);const {tool:approved}=await response.json();
 assert.equal(approved.lastVerifiedAt,null);assert.equal(approved.checksFailed,2);assert.equal(approved.description,original.description);assert.notEqual(approved.contentVersion,original.contentVersion);assert.equal(approved.linkPolicy,'dofollow');assert.equal(isDofollow(approved,new Date(Date.now()+100*86400000)),true);
 assert.equal((await admin(env,path,input)).status,428);
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM notification_outbox').get().n,0);
 const summary=(await (await call(env,'/api/content')).json()).tools[0];assert.equal(summary.linkPolicy,'dofollow');assert.equal(outboundRel(summary),'noopener');
 const html=await (await call(env,'/tool/legacy-link')).text();assert.match(html,/Official link is approved as dofollow/);assert.ok(!html.includes('rel="noopener nofollow'));assert.ok((await (await call(env,'/sitemap-tools.xml')).text()).includes('/tool/legacy-link'));
 assert.equal(isDofollow({...approved,approved:false}),false);assert.equal(isDofollow({...approved,status:'archived'}),false);
 const reverted=await admin(env,path,{linkPolicy:'verified',expectedVersion:approved.contentVersion});assert.equal(reverted.status,200);assert.equal(isDofollow((await reverted.json()).tool),false);
});

test('ordinary form fields cannot grant dofollow approval and invalid link policies are rejected',async()=>{
 const env=environment();env.EMAIL=undefined;const value=tool();store(env,value);
 assert.equal((await admin(env,'/api/admin/content/'+value.slug+'/link-policy',{linkPolicy:'invalid',expectedVersion:value.contentVersion})).status,400);
 assert.ok(validateTool({...value,linkPolicy:'invalid'},value.slug).errors.length);
 const submitted=await submit(env,{name:'Ordinary project',url:'https://ordinary-link.com',email:'lvyinchao@gmail.com',category:'ai-coding',notes:value.description,own:'yes',linkPolicy:'dofollow'});assert.equal((await submitted.json()).status,'queued');assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM managed_tools').get().n,1);
});

test('editing the same URL preserves dofollow approval and a changed URL needs a new decision',async()=>{
 const env=environment();env.EMAIL=undefined;const value=tool('edited-link',{linkPolicy:'dofollow'});store(env,value);
 const {linkPolicy,...edited}=value;
 const result=await admin(env,'/api/admin/content/'+value.slug,{...edited,summary:edited.summary+' More context.',expectedVersion:value.contentVersion},{method:'PUT'});assert.equal(result.status,200);const current=(await result.json()).tool;assert.equal(current.linkPolicy,'dofollow');
 const {linkPolicy:previous,...changed}=current;
 const moved=await admin(env,'/api/admin/content/'+value.slug,{...changed,url:'https://changed-link.com',expectedVersion:current.contentVersion},{method:'PUT'});assert.equal(moved.status,200);assert.equal(isDofollow((await moved.json()).tool),false);
});
