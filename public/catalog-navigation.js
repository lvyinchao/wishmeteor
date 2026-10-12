/** Restore list state from a path page as well as legacy query URLs. */
export function catalogLocation(url) {
 const params=new URLSearchParams(url.search);
 const category=/^\/category\/([a-z0-9-]+)(?:\/\d+)?\/?$/.exec(url.pathname);
 if(category)params.set('category',category[1]);
 if(!params.has('page'))params.set('page',/\/(\d+)\/?$/.exec(url.pathname)?.[1] ?? '1');
 return params;
}

/** A filter change starts a fresh page while retaining the chosen page size. */
export function catalogFormParams(url,entries) {
 const params=new URLSearchParams(),limit=new URLSearchParams(url.search).get('limit');
 if(limit)params.set('limit',limit);
 for(const [key,value] of entries)if(value)params.set(key,String(value));
 return params;
}

/** Keep the head consistent with the server URL after an in-page list navigation. */
export function updateCatalogMetadata(document,pageUrl,itemList) {
 // The server supplies the site's canonical origin, including on aliases/previews.
 const canonical=new URL(itemList.url).href;
 document.querySelector('link[rel="canonical"]')?.setAttribute('href',canonical);
 document.querySelector('meta[property="og:url"]')?.setAttribute('content',canonical);
 for(const script of document.querySelectorAll('script[type="application/ld+json"]')) {
  try {if(JSON.parse(script.textContent)['@type']==='ItemList')script.textContent=JSON.stringify(itemList);}catch{}
 }
}
