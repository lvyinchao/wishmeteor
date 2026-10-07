import test from 'node:test';
import assert from 'node:assert/strict';
import { environment } from './harness.mjs';
import { tool,store,call } from './fixtures.mjs';
import { urlset,sitemapIndex,sitemapDate,SITEMAP_TOOL_LIMIT } from '../src/lib/sitemap.mjs';
const now=new Date('2026-10-07T10:00:00Z');

test('sitemap dates normalize real dates and UTC database times without fabricating unknown or future dates',()=>{
 for(const value of ['2026-10-05','2026-10-05T06:38:06.369Z','2026-10-05 06:38:06','2026-10-05 06:38:06.123',new Date('2026-10-05T06:38:06Z')])assert.equal(sitemapDate(value,now),'2026-10-05');
 assert.equal(sitemapDate('2026-10-06T23:00:00-02:00',now),'2026-10-07');assert.equal(sitemapDate('2024-02-29',now),'2024-02-29');
 for(const value of [null,undefined,'','not a date',new Date(NaN),123,'0000-01-01','2026-02-29','2026-04-31','2026-13-01','2026-10-05T24:00:00Z','2026-10-05T00:60:00Z','2026-10-05T00:00:60Z','2026-10-05T01:00:00','2026-10-05T00:00:00+14:01','2026-10-05T00:00:00+15:00','2026-10-08','2026-10-07T11:00:00Z'])assert.equal(sitemapDate(value,now),null,String(value));
});

test('all sitemap XML builders escape locations, deduplicate URLs and omit untrusted lastmod values',()=>{
 const site=new URL('https://wishmeteor.net');const items=[{path:'/tools?q=alpha&origin=submitted',lastmod:'2026-10-05 06:38:06'},{path:'/tools?q=alpha&origin=submitted#section',lastmod:'2026-10-06'},{path:'/about',lastmod:'not <a> date'},{path:'https://other.com/page',lastmod:'2026-10-05'}];
 for(const build of [urlset,sitemapIndex]){const xml=build(site,items,{now});assert.match(xml,/encoding="UTF-8"/);assert.match(xml,/\?q=alpha&amp;origin=submitted/);assert.equal((xml.match(/<loc>/g)??[]).length,2);assert.equal((xml.match(/<lastmod>/g)??[]).length,1);assert.match(xml,/<lastmod>2026-10-05<\/lastmod>/);assert.ok(!xml.includes('other.com')&&!xml.includes('not <a>'));}
});

test('live product dates come from listing changes, remain stable, and never include hidden products or bad dates',async()=>{
 const env=environment();env.EMAIL=undefined;
 store(env,tool('database-time',{updatedAt:'2026-10-03 14:00:00',lastVerifiedAt:'2026-10-06T00:00:00Z'}));store(env,tool('bad-date',{updatedAt:'invalid<&'}));store(env,tool('future-date',{updatedAt:'2099-01-01T00:00:00Z'}));store(env,tool('hidden',{approved:false}));store(env,tool('removed',{status:'archived'}));
 const response=await call(env,'/sitemap-tools.xml'),xml=await response.text();assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/xml/);assert.match(xml,/<loc>https:\/\/wishmeteor.net\/tool\/database-time<\/loc><lastmod>2026-10-03<\/lastmod>/);assert.ok(!xml.includes('2099')&&!xml.includes('invalid')&&!xml.includes('/tool/hidden')&&!xml.includes('/tool/removed'));assert.equal((xml.match(/<loc>/g)??[]).length,3);assert.equal((xml.match(/<lastmod>/g)??[]).length,1);assert.equal(await (await call(env,'/sitemap-tools.xml')).text(),xml);
});

test('page maps cover default directory and category pagination with matching canonical URLs',async()=>{
 const env=environment();env.EMAIL=undefined;for(let n=0;n<25;n++)store(env,tool('pagination-'+n,{category:n<13?'ai-coding':'ai-chat'}));
 const xml=await (await call(env,'/sitemap-pages.xml')).text();for(const path of ['/tools/2','/tools/3','/new/3','/category/ai-coding/2','/blog','/news'])assert.ok(xml.includes('https://wishmeteor.net'+path+'</loc>'),path);assert.ok(!xml.includes('/tools/4')&&!xml.includes('/category/ai-chat/2')&&!xml.includes('/admin')&&!xml.includes('/account')&&!xml.includes('/compare'));
 for(const path of ['/tools/2','/tools?page=2','/?page=2'])assert.match(await (await call(env,path)).text(),/<link rel="canonical" href="https:\/\/wishmeteor.net\/tools\/2">/);
 const sitemap=await (await call(env,'/sitemap.xml')).text();assert.match(sitemap,/<sitemapindex/);assert.equal((sitemap.match(/<loc>/g)??[]).length,3);
});

test('product sitemap shards neither truncate nor duplicate rows and out-of-range shards return 404',async()=>{
 const env=environment();env.EMAIL=undefined;const sample=tool();
 const insert=env.DB.sqlite.prepare('INSERT INTO managed_tools(slug,content_json,root_domain,dedupe_key,created_at,updated_at) VALUES(?,?,?,?,?,?)');
 env.DB.sqlite.exec('BEGIN');try{for(let n=0;n<=SITEMAP_TOOL_LIMIT;n++){const slug='shard-'+n,domain=slug+'.com';insert.run(slug,JSON.stringify({...sample,slug,url:'https://'+domain}),domain,domain,sample.publishedAt,sample.updatedAt);}env.DB.sqlite.exec('COMMIT');}catch(error){env.DB.sqlite.exec('ROLLBACK');throw error;}
 const index=await (await call(env,'/sitemap.xml')).text();assert.ok(index.includes('/sitemap-tools-2.xml'));
 const first=await (await call(env,'/sitemap-tools.xml')).text(),second=await (await call(env,'/sitemap-tools-2.xml')).text();const locations=xml=>[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);const a=locations(first),b=locations(second);assert.equal(a.length,SITEMAP_TOOL_LIMIT);assert.equal(b.length,1);assert.equal(new Set([...a,...b]).size,SITEMAP_TOOL_LIMIT+1);
 for(const suffix of ['0','1','01','3','9007199254740992'])assert.equal((await call(env,'/sitemap-tools-'+suffix+'.xml')).status,404,suffix);
});

test('an empty catalog never advertises an empty product sitemap',async()=>{
 const env=environment();env.EMAIL=undefined;store(env,tool('private-only',{approved:false}));
 const index=await (await call(env,'/sitemap.xml')).text();assert.ok(!index.includes('/sitemap-tools'));assert.equal((index.match(/<loc>/g)??[]).length,2);assert.equal((await call(env,'/sitemap-tools.xml')).status,404);
});
