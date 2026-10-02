import { getDomain,parse } from 'tldts';

export const CATEGORY_NAMES:Record<string,string>={
  'ai-coding':'Coding','ai-chat':'Chat & Assistants','image-video':'Image & Video','audio-voice':'Voice & Music',
  'agents-automation':'Agents & Automation','data-retrieval':'Search & RAG','model-platforms':'Models & Inference',
  'evals-observability':'Evals & Ops','open-source-models':'Open Weights',productivity:'Writing & Research',
  'education-learning':'Education & Learning','sports-fitness':'Sports & Fitness','marketing-growth':'Marketing & Growth',
  'business-services':'Business Services','maker-tools':'Maker Tools',uncategorized:'New discoveries',
};
export const PRICING=['free','freemium','paid','open-source'] as const;
export const STATUSES=['active','beta','stale','archived'] as const;
export const SLUG_RE=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export interface Source { type:string;url:string;observedAt:string|null;title?:string }
export interface Wish { submittedAt:string;makerWish?:string;blessingShort:string;blessingLong:string;blessingApproved:boolean;notifiedAt:string|null }
export interface Tool {
  slug:string;name:string;url:string;category:string;summary:string;description:string;tags:string[];
  pricing:typeof PRICING[number];status:typeof STATUSES[number];origin:'curated'|'submitted';sources:Source[];
  firstSeenAt:string;lastSeenAt:string;lastVerifiedAt:string|null;checksFailed:number;approved:boolean;
  submittedAt?:string;approvedAt?:string;publishedAt?:string;updatedAt?:string;contentVersion?:string;
  coverImage?:string;wish?:Wish;lastCheckState?:'live'|'dead'|'blocked';lastCheckedAt?:string;
}
export interface ToolSummary extends Omit<Tool,'description'|'sources'> { stars:number;rankStars:number;descriptionLength:number }
export function isPublicTool(tool:Pick<Tool,'approved'|'status'>):boolean { return tool.approved===true&&tool.status!=='archived'; }
export function isoDate(value:unknown):value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(value+'T00:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
export function isoTimestamp(value:unknown):value is string { return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value)); }

export function canonicalProductUrl(raw:unknown):{url:string;domain:string;projectKey:string}|null {
  if(typeof raw!=='string'||raw.length>2048)return null;
  try {
    const parsed=new URL(raw.trim());
    const hostnameInfo=parse(parsed.hostname,{allowPrivateDomains:true});
    if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.port||
      hostnameInfo.isIp||!hostnameInfo.domain||(!hostnameInfo.isIcann&&!hostnameInfo.isPrivate)||
      /(^|\.)(localhost|local|internal|invalid|test|example|onion)$/.test(parsed.hostname)||
      parsed.hostname==='wishmeteor.net'||parsed.hostname.endsWith('.wishmeteor.net'))return null;
    parsed.hostname=parsed.hostname.toLowerCase();parsed.hash='';
    for(const key of [...parsed.searchParams.keys()])if(/^(utm_|fbclid$|gclid$|ref$|referral$)/i.test(key))parsed.searchParams.delete(key);
    parsed.searchParams.sort();
    const domain=getDomain(parsed.hostname,{allowPrivateDomains:true}) ?? parsed.hostname;
    const url=parsed.toString().replace(/\/$/,'');
    const projectPath=parsed.pathname.split('/').filter(Boolean);
    let projectKey=domain;
    if(['github.com','gitlab.com'].includes(domain)&&projectPath.length>=2) {
      projectKey=`${domain}:${projectPath.slice(0,2).join('/').replace(/\.git$/,'').toLowerCase()}`;
    } else if(domain==='huggingface.co'&&projectPath.length>=2) {
      const explicit=['models','datasets','spaces'].includes(projectPath[0]);
      const kind=explicit?projectPath[0]:'models',parts=explicit?projectPath.slice(1,3):projectPath.slice(0,2);
      if(parts.length===2)projectKey=`huggingface.co:${kind}:${parts.join('/').toLowerCase()}`;
    } else if(parsed.hostname==='apps.apple.com') {
      const appId=projectPath.find(part=>/^id\d+$/.test(part));if(appId)projectKey='apps.apple.com:'+appId;
    } else if(parsed.hostname==='play.google.com'&&parsed.searchParams.get('id')) {
      projectKey='play.google.com:'+parsed.searchParams.get('id');
    } else if(parsed.hostname==='chromewebstore.google.com'&&projectPath.at(-1)) {
      projectKey='chromewebstore.google.com:'+projectPath.at(-1);
    } else if(parsed.hostname==='marketplace.visualstudio.com'&&parsed.searchParams.get('itemName')) {
      projectKey='marketplace.visualstudio.com:'+parsed.searchParams.get('itemName')!.toLowerCase();
    }
    return {url,domain,projectKey};
  } catch {return null;}
}

function text(input:Record<string,unknown>,field:string,min:number,max:number,errors:string[]):string {
  const value=typeof input[field]==='string'?input[field].trim():'';
  if(value.length<min||value.length>max)errors.push(`${field} must contain ${min}-${max} characters`);
  return value;
}

/** Runtime validation shared by moderation, import and static drafting tools. */
export function validateTool(raw:unknown,slug:string,now=new Date()):{value:Tool;errors:string[]} {
  const errors:string[]=[];
  const input=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))errors.push('content must be an object');
  if(!SLUG_RE.test(slug)||slug.length>100)errors.push('slug must be a lowercase slug of at most 100 characters');
  const name=text(input,'name',1,80,errors),summary=text(input,'summary',40,160,errors),description=text(input,'description',300,12000,errors);
  const canonical=canonicalProductUrl(input.url);if(!canonical)errors.push('url must be a public http(s) homepage without credentials or a custom port');
  const category=typeof input.category==='string'?input.category:'';if(!Object.hasOwn(CATEGORY_NAMES,category))errors.push('category is not recognized');
  const tags=Array.isArray(input.tags)?input.tags:[];
  if(tags.length<1||tags.length>12||tags.some(tag=>typeof tag!=='string'||!tag.trim()||tag.length>40))errors.push('tags must contain 1-12 non-empty strings of at most 40 characters');
  const pricing=String(input.pricing) as Tool['pricing'],status=String(input.status) as Tool['status'];
  if(!PRICING.includes(pricing))errors.push('pricing must be free, freemium, paid, or open-source');
  if(!STATUSES.includes(status))errors.push('status must be active, beta, stale, or archived');
  const origin=input.origin==='submitted'?'submitted':'curated';
  if(input.origin!==undefined&&!['submitted','curated'].includes(String(input.origin)))errors.push('origin must be submitted or curated');
  const today=now.toISOString().slice(0,10);
  const sources:Source[]=[];
  if(input.sources!==undefined&&!Array.isArray(input.sources))errors.push('sources must be an array');
  if(Array.isArray(input.sources)) {
    if(input.sources.length>10)errors.push('sources may contain at most 10 items');
    for(const rawSource of input.sources.slice(0,10)) {
      if(!rawSource||typeof rawSource!=='object'||Array.isArray(rawSource)){errors.push('each source must be an object');continue;}
      const source=rawSource as Record<string,unknown>,url=canonicalProductUrl(source.url);
      const type=typeof source.type==='string'?source.type.trim():'';
      if(!url||!type||type.length>80){errors.push('each source needs a public URL and a type of 1-80 characters');continue;}
      const observedAt=source.observedAt==null?null:source.observedAt;
      if(observedAt!==null&&(!isoDate(observedAt)||observedAt>today))errors.push('source observedAt must be a real past/current date or null');
      sources.push({type,url:url.url,observedAt:typeof observedAt==='string'?observedAt:null,...(typeof source.title==='string'?{title:source.title.slice(0,160)}:{})});
    }
  }
  // The source is supplied by the editor/submitter, not a claim of verification.
  if(!sources.length&&canonical)sources.push({type:origin==='submitted'?'submitter':'editor-provided',url:canonical.url,observedAt:null});
  const firstSeenAt=input.firstSeenAt===undefined?today:input.firstSeenAt;
  if(!isoDate(firstSeenAt)||firstSeenAt>today)errors.push('firstSeenAt must be a real past/current date');
  if(input.coverImage!==undefined&&input.coverImage!==`/tool-previews/${slug}.jpg`)errors.push('coverImage must match the product preview path');
  let wish:Wish|undefined;
  if(input.wish!==undefined) {
    if(!input.wish||typeof input.wish!=='object'||Array.isArray(input.wish))errors.push('wish must be an object');
    else {
      const w=input.wish as Record<string,unknown>;
      const submittedAt=w.submittedAt ?? today;if(!isoDate(submittedAt)||submittedAt>today)errors.push('wish submittedAt must be a real past/current date');
      const blessingShort=typeof w.blessingShort==='string'?w.blessingShort.trim():'';
      const blessingLong=typeof w.blessingLong==='string'?w.blessingLong.trim():'';
      if(blessingShort.length>120||blessingLong.length>600)errors.push('blessings exceed the length limit');
      const makerWish=typeof w.makerWish==='string'?w.makerWish.trim():'';
      if(w.makerWish!==undefined&&typeof w.makerWish!=='string')errors.push('makerWish must be a string');
      if(makerWish.length>320)errors.push('makerWish must contain at most 320 characters');
      wish={submittedAt:typeof submittedAt==='string'?submittedAt:today,blessingShort,blessingLong,blessingApproved:w.blessingApproved===true,notifiedAt:null,...(makerWish?{makerWish}:{})};
    }
  }
  return {errors,value:{slug,name,url:canonical?.url ?? '',category,summary,description,tags:tags.filter((t):t is string=>typeof t==='string').map(t=>t.trim()),pricing,status,origin,sources,firstSeenAt:typeof firstSeenAt==='string'?firstSeenAt:today,lastSeenAt:today,lastVerifiedAt:null,checksFailed:0,approved:input.approved!==false,...(input.coverImage?{coverImage:String(input.coverImage)}:{}),...(wish?{wish}:{})}};
}

export function blessingErrors(tool:Tool):string[] {
  if(!tool.wish?.blessingApproved)return ['Confirm the edited blessing before publishing'];
  if(tool.wish.blessingShort.length<1||tool.wish.blessingLong.length<120)return ['A blessing needs a short line and a full text of 120-600 characters'];
  return [];
}
