/** Restore list state from a path page as well as legacy query URLs. */
export function catalogLocation(url) {
 const params=new URLSearchParams(url.search);
 const category=/^\/category\/([a-z0-9-]+)(?:\/\d+)?\/?$/.exec(url.pathname);
 if(category)params.set('category',category[1]);
 if(!params.has('page'))params.set('page',/\/(\d+)\/?$/.exec(url.pathname)?.[1] ?? '1');
 return params;
}

/** Keep the head consistent with the server URL after an in-page list navigation. */
export function updateCatalogMetadata(document,pageUrl,itemList) {
 const canonical=new URL(pageUrl,document.baseURI).href;
 document.querySelector('link[rel="canonical"]')?.setAttribute('href',canonical);
 document.querySelector('meta[property="og:url"]')?.setAttribute('content',canonical);
 for(const script of document.querySelectorAll('script[type="application/ld+json"]')) {
  try {if(JSON.parse(script.textContent)['@type']==='ItemList')script.textContent=JSON.stringify(itemList);}catch{}
 }
}
