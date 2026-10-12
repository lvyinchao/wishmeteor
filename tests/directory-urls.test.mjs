import test from 'node:test';
import assert from 'node:assert/strict';
import { environment } from './harness.mjs';
import { call,store,tool } from './fixtures.mjs';
import { catalogLocation,updateCatalogMetadata } from '../public/catalog-navigation.js';

const fixture=()=>{const env=environment();env.EMAIL=undefined;for(let n=0;n<32;n++)store(env,tool('directory-'+n,{category:n<25?'ai-coding':'ai-chat'}));return env;};
const links=text=>[...text.matchAll(/<a class="catalog-page" href="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));

test('directory aliases, query pagination, page one and trailing slashes redirect directly to /new',async()=>{
 const env=fixture();
 for(const [from,to] of [['/tools','/new'],['/tools/','/new'],['/tools/1','/new'],['/tools/3','/new/3'],['/tools/25/','/new/25'],['/tools/10/?page=3&pricing=freemium&q=complete','/new/3?pricing=freemium&q=complete'],['/new/1/','/new'],['/new/3/','/new/3'],['/new?page=3','/new/3'],['/new/3?page=2','/new/2'],['/?page=2','/new/2'],['/category/ai-coding/2/?page=1&q=complete','/category/ai-coding?q=complete']]) {
  const response=await call(env,from);assert.equal(response.status,308,from);assert.equal(response.headers.get('location'),to,from);assert.notEqual((await call(env,to)).status,308,to);
 }
 const head=await call(env,'/tools/3',undefined,{method:'HEAD'});assert.equal(head.status,308);assert.equal(head.headers.get('location'),'/new/3');assert.equal(await head.text(),'');
 const cursor=(await (await call(env,'/api/content?limit=2')).json()).nextCursor;
 const redirect=await call(env,'/tools?cursor='+encodeURIComponent(cursor));assert.equal(new URL(redirect.headers.get('location'),'https://wishmeteor.net').searchParams.get('cursor'),cursor);
 const tracked=await call(env,'/tools/3?utm_source=email&custom=keep');assert.equal(tracked.headers.get('location'),'/new/3?utm_source=email&custom=keep');
});

test('canonical, ItemList and crawlable page links agree while retaining filters and category state',async()=>{
 const env=fixture(),url='/new/2?q=complete&pricing=freemium&origin=curated&sort=popular&limit=3';
 const text=await (await call(env,url)).text();
 assert.match(text,/<link rel="canonical" href="https:\/\/wishmeteor.net\/new\/2\?limit=3&amp;origin=curated&amp;pricing=freemium&amp;q=complete&amp;sort=popular">/);
 const item=JSON.parse([...text.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)].find(m=>JSON.parse(m[1])['@type']==='ItemList')[1]);
 assert.equal(item.url,'https://wishmeteor.net/new/2?limit=3&origin=curated&pricing=freemium&q=complete&sort=popular');
 assert.deepEqual(links(text),['/new?limit=3&origin=curated&pricing=freemium&q=complete&sort=popular','/new/3?limit=3&origin=curated&pricing=freemium&q=complete&sort=popular']);
 const category=await (await call(env,'/category/ai-coding/2')).text();assert.deepEqual(links(category),['/category/ai-coding','/category/ai-coding/3']);assert.ok(!category.includes('/tools'));
 const data=await (await call(env,'/api/content?view=cards&category=ai-coding&page=2&q=complete&pricing=freemium')).json();
 assert.equal(data.pageUrl,'/category/ai-coding/2?pricing=freemium&q=complete');assert.equal(data.itemList.url,'https://wishmeteor.net'+data.pageUrl);assert.ok(links(data.pagination).every(h=>h.startsWith('/category/ai-coding')&&!h.includes('page=')&&!h.includes('view=')));
 const root=await (await call(env,'/')).text();assert.match(root,/rel="canonical" href="https:\/\/wishmeteor.net"/);assert.deepEqual(links(root),['/new/2']);
 const tracked=await (await call(env,'/new/2?utm_source=email&custom=keep')).text();assert.match(tracked,/rel="canonical" href="https:\/\/wishmeteor.net\/new\/2"/);
});

test('invalid pagination stays invalid and unrelated product, API and static routes are not redirected',async()=>{
 const env=fixture();for(const path of ['/tools?page=0','/new/100001','/new?page=abc'])assert.equal((await call(env,path)).status,400,path);
 for(const path of ['/tool/directory-0','/tool/directory-0/card.svg','/api/content?page=2','/sitemap-tools.xml','/compare?slugs=directory-0','/about','/tools/not-a-page'])assert.notEqual((await call(env,path)).status,308,path);
 assert.equal((await call(env,'/tools',{})).status,405);
});

test('browser back state includes route page/category and updates canonical, og:url and ItemList',()=>{
 const state=catalogLocation(new URL('https://wishmeteor.net/category/ai-coding/3?q=complete&pricing=free'));assert.equal(state.get('page'),'3');assert.equal(state.get('category'),'ai-coding');assert.equal(state.get('q'),'complete');assert.equal(state.get('pricing'),'free');
 assert.equal(catalogLocation(new URL('https://wishmeteor.net/new/3?page=2')).get('page'),'2');
 const attrs={},item={textContent:JSON.stringify({'@type':'ItemList',url:'old'})},website={textContent:JSON.stringify({'@type':'WebSite',url:'https://wishmeteor.net'})},other={textContent:'not json'};
 const document={baseURI:'https://wishmeteor.net/new',querySelector:selector=>({setAttribute:(name,value)=>attrs[selector+name]=value}),querySelectorAll:()=>[item,website,other]};
 const fresh={'@type':'ItemList',url:'https://wishmeteor.net/new/3',itemListElement:[]};updateCatalogMetadata(document,'/new/3',fresh);
 assert.equal(attrs['link[rel="canonical"]href'],'https://wishmeteor.net/new/3');assert.equal(attrs['meta[property="og:url"]content'],'https://wishmeteor.net/new/3');assert.deepEqual(JSON.parse(item.textContent),fresh);assert.equal(JSON.parse(website.textContent)['@type'],'WebSite');assert.equal(other.textContent,'not json');
});
