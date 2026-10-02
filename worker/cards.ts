import { escapeHtml as e } from '../src/lib/html.ts';
import type { Tool } from '../src/lib/tool-schema.ts';
import { CatalogRepository } from './catalog.ts';
import { notFound } from './public.ts';
import type { Env } from './env.ts';

function glyphWidth(c:string):number {return c.charCodeAt(0)>255?1:/[WMmw@#%]/.test(c)?1:/[A-Z]/.test(c)?.8:/[ilIjt.,:;!|]/.test(c)?.4:.62;}
function wrap(value:string,columns:number):string[] {
  const lines:string[]=[];let line='',width=0;
  for(const word of value.replace(/\s+/g,' ').split(' ')) {
    const wordWidth=[...word].reduce((n,c)=>n+glyphWidth(c),0);
    if(line&&width+wordWidth+.6>columns){lines.push(line);line='';width=0;}
    for(const character of word) {
      const size=glyphWidth(character);
      if(width+size>columns){lines.push(line);line='';width=0;}
      line+=character;width+=size;
    }
    line+=' ';width+=.6;
  }
  if(line.trim())lines.push(line.trim());return lines;
}
export function cardSvg(tool:Tool):string {
  let titleSize=48,titleLines=wrap(tool.name,1040/titleSize);
  while(titleLines.length>2){titleSize-=2;titleLines=wrap(tool.name,1040/titleSize);}
  const blessing=tool.wish?.blessingApproved?tool.wish.blessingLong:tool.summary;
  const bodyTop=170+titleLines.length*titleSize*1.15;
  let bodySize=28,bodyLines=wrap(blessing,1040/bodySize);
  while(bodyLines.length*bodySize*1.4>550-bodyTop){bodySize--;bodyLines=wrap(blessing,1040/bodySize);}
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><title>${e(tool.name)} — WishMeteor</title><desc>${e(blessing)}</desc><defs><linearGradient id="sky" x2="1" y2="1"><stop stop-color="#111a33"/><stop offset="1" stop-color="#060917"/></linearGradient></defs><rect width="1200" height="630" fill="url(#sky)"/><circle cx="1100" cy="90" r="35" fill="#ffd166" opacity=".2"/><path d="M920 160 1080 35" stroke="#ffd166" stroke-width="3" opacity=".3"/><text x="70" y="86" fill="#ffd166" font-size="26" font-family="Inter,sans-serif" letter-spacing="3">WISHMETEOR · ${tool.wish?.blessingApproved?'A BLESSING FOR YOUR NEXT CHAPTER':'PROJECT DISCOVERY'}</text><text fill="#e9edfa" font-size="${titleSize}" font-family="Inter,sans-serif" font-weight="600">${titleLines.map((line,i)=>`<tspan x="70" y="${160+i*titleSize*1.15}">${e(line.trim())}</tspan>`).join('')}</text><text fill="${tool.wish?.blessingApproved?'#ffd166':'#9aa6c8'}" font-size="${bodySize}" font-family="Inter,sans-serif">${bodyLines.map((line,i)=>`<tspan x="70" y="${bodyTop+i*bodySize*1.4}">${e(line.trim())}</tspan>`).join('')}</text><text x="70" y="578" fill="#9aa6c8" font-size="23" font-family="Inter,sans-serif">wishmeteor.net/tool/${e(tool.slug)}</text><text x="1130" y="610" text-anchor="end" fill="#9aa6c8" font-size="14" font-family="Inter,sans-serif">version ${e(tool.contentVersion ?? 'original')}</text></svg>`;
}
export async function cardResponse(request:Request,env:Env,slug:string,format:string):Promise<Response> {
  const current=await new CatalogRepository(env.DB).get(slug);if(!current)return notFound(env);
  const version=new URL(request.url).searchParams.get('v');let tool=current;
  if(version&&version!==(current.contentVersion ?? current.updatedAt ?? '')) {
    if(version.length>64)return notFound(env);
    const row=await env.DB.prepare('SELECT card_json FROM tool_cards WHERE slug=? AND version=?').bind(slug,version).first<{card_json:string}>();if(!row)return notFound(env);tool=JSON.parse(row.card_json);
  }
  const svg=cardSvg(tool),headers={'content-type':format==='svg'?'image/svg+xml; charset=utf-8':'image/png','x-content-type-options':'nosniff'};
  if(format==='svg')return new Response(svg,{headers});
  const png=await (await import('./raster.ts')).rasterize(svg);
  return new Response(png,{headers});
}
