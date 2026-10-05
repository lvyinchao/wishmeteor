import { CATEGORY_NAMES,SLUG_RE,type Tool,type ToolSummary } from '../src/lib/tool-schema.ts';
import { HttpError } from './http.ts';

export interface CatalogFilters { q?:string;category?:string;pricing?:string;origin?:string;sort?:'newest'|'popular';cursor?:string;page?:number;limit?:number }
export interface CatalogPage {tools:ToolSummary[];total:number;page:number;limit:number;nextCursor:string|null;version:number;starVersion:number}
interface ContentRow {content_json:string;published_at?:string;updated_at?:string;star_count?:number;trusted_star_count?:number;description_length?:number}
const PUBLIC="t.approved=1 AND t.status!='archived'";

function readTool(row:ContentRow):Tool {
  const tool=JSON.parse(row.content_json) as Tool;
  if(row.published_at&&!tool.publishedAt)tool.publishedAt=row.published_at;
  if(row.updated_at)tool.updatedAt=row.updated_at;
  return tool;
}
export function summarize(tool:Tool,stars=0,descriptionLength=tool.description?.length ?? 0,rankStars=stars):ToolSummary {
  const {slug,name,url,category,summary,tags,pricing,status,origin,firstSeenAt,lastSeenAt,lastVerifiedAt,checksFailed,approved,publishedAt,approvedAt,submittedAt,updatedAt,contentVersion,coverImage,linkPolicy}=tool;
  return {slug,name,url,category,summary,tags,pricing,status,origin,firstSeenAt,lastSeenAt,lastVerifiedAt,checksFailed,approved,publishedAt,approvedAt,submittedAt,updatedAt,contentVersion,coverImage,linkPolicy,stars,rankStars,descriptionLength,
    ...(tool.wish?{wish:{...tool.wish,blessingLong:''}}:{})};
}
function encodeCursor(tool:ToolSummary,sort:string):string {return btoa(JSON.stringify({v:1,sort,stamp:tool.publishedAt,slug:tool.slug,stars:tool.rankStars}));}
function decodeCursor(raw:string,sort:string):{stamp:string;slug:string;stars:number} {
  try {
    if(raw.length>512)throw new Error();
    const cursor=JSON.parse(atob(raw));
    if(cursor.v!==1||cursor.sort!==sort||typeof cursor.stamp!=='string'||!Number.isFinite(Date.parse(cursor.stamp))||typeof cursor.slug!=='string'||!SLUG_RE.test(cursor.slug)||!Number.isInteger(cursor.stars)||cursor.stars<0)throw new Error();
    return cursor;
  } catch {throw new HttpError('invalid-cursor');}
}

/** All public product reads use this repository; source files are drafts only. */
export class CatalogRepository {
  readonly db:D1Database;
  constructor(db:D1Database) {this.db=db;}
  async version():Promise<{version:number;starVersion:number}> {
    const row=await this.db.prepare('SELECT c.version,s.version AS starVersion FROM catalog_meta c JOIN star_meta s ON s.id=c.id WHERE c.id=1').first<{version:number;starVersion:number}>();
    if(!row)throw new Error('catalog-migrations-required');return row;
  }
  async get(slug:string,includePrivate=false):Promise<Tool|null> {
    if(!SLUG_RE.test(slug)||slug.length>100)return null;
    const row=await this.db.prepare(`SELECT content_json,published_at,updated_at FROM managed_tools t WHERE t.slug=? ${includePrivate?'':`AND ${PUBLIC}`}`)
      .bind(slug).first<ContentRow>();
    return row?readTool(row):null;
  }
  async list(filters:CatalogFilters={},version?:{version:number;starVersion:number}):Promise<CatalogPage> {
    const q=(filters.q ?? '').trim().slice(0,120),category=filters.category ?? '',pricing=filters.pricing ?? '',origin=filters.origin ?? '';
    const sort=filters.sort==='popular'?'popular':'newest';
    const limit=Math.max(1,Math.min(Number.isSafeInteger(filters.limit)?filters.limit!:12,48));
    const page=Math.max(1,Math.min(Number.isSafeInteger(filters.page)?filters.page!:1,100_000));
    const conditions=[PUBLIC],values:(string|number)[]=[];
    if(category&&category!=='all'){conditions.push('t.category=?');values.push(category);}
    if(pricing&&pricing!=='all'){conditions.push('t.pricing=?');values.push(pricing);}
    if(['submitted','curated'].includes(origin)){conditions.push('t.origin=?');values.push(origin);}
    for(const word of q.split(/\s+/).filter(Boolean).slice(0,6)) {
      conditions.push("(json_extract(t.content_json,'$.name') LIKE ? ESCAPE '\\' OR json_extract(t.content_json,'$.summary') LIKE ? ESCAPE '\\' OR json_extract(t.content_json,'$.description') LIKE ? ESCAPE '\\' OR json_extract(t.content_json,'$.tags') LIKE ? ESCAPE '\\')");
      const pattern='%'+word.replace(/[\\%_]/g,c=>'\\'+c)+'%';values.push(pattern,pattern,pattern,pattern);
    }
    const count=await this.db.prepare(`SELECT COUNT(*) AS total FROM managed_tools t WHERE ${conditions.join(' AND ')}`).bind(...values).first<{total:number}>();
    if(filters.cursor) {
      const cursor=decodeCursor(filters.cursor,sort);
      const timeCondition='(t.published_at<? OR (t.published_at=? AND t.slug>?))';
      if(sort==='popular') {
        conditions.push(`(t.trusted_star_count<? OR (t.trusted_star_count=? AND ${timeCondition}))`);
        values.push(cursor.stars,cursor.stars,cursor.stamp,cursor.stamp,cursor.slug);
      } else {conditions.push(timeCondition);values.push(cursor.stamp,cursor.stamp,cursor.slug);}
    }
    const rows=await this.db.prepare(`SELECT json_remove(content_json,'$.description','$.sources','$.wish.blessingLong') AS content_json,published_at,updated_at,star_count,trusted_star_count,length(json_extract(content_json,'$.description')) AS description_length
      FROM managed_tools t WHERE ${conditions.join(' AND ')} ORDER BY ${sort==='popular'?'trusted_star_count DESC, ':''}published_at DESC,slug ASC LIMIT ? OFFSET ?`)
      .bind(...values,limit+1,filters.cursor?0:(page-1)*limit).all<ContentRow>();
    const found=(rows.results ?? []).map(r=>summarize(readTool(r),r.star_count ?? 0,r.description_length ?? 0,r.trusted_star_count ?? 0));
    const more=found.length>limit,tools=found.slice(0,limit);
    return {tools,total:count?.total ?? 0,page,limit,nextCursor:more&&tools.length?encodeCursor(tools.at(-1)!,sort):null,...(version ?? await this.version())};
  }
  async categories():Promise<{id:string;name:string;count:number}[]> {
    const rows=await this.db.prepare(`SELECT category,COUNT(*) AS count FROM managed_tools t WHERE ${PUBLIC} GROUP BY category ORDER BY category`).all<{category:string;count:number}>();
    return (rows.results ?? []).map(r=>({id:r.category,name:CATEGORY_NAMES[r.category] ?? r.category.replace(/-/g,' '),count:r.count}));
  }
  async related(tool:Tool,limit=3):Promise<ToolSummary[]> {return (await this.list({category:tool.category,limit:Math.min(limit+1,48)})).tools.filter(t=>t.slug!==tool.slug).slice(0,limit);}
  async bySlugs(slugs:string[]):Promise<Tool[]> {
    const valid=[...new Set(slugs)].filter(s=>SLUG_RE.test(s)&&s.length<=100).slice(0,24);if(!valid.length)return [];
    const rows=await this.db.prepare(`SELECT content_json,published_at,updated_at FROM managed_tools t WHERE ${PUBLIC} AND slug IN (${valid.map(()=>'?').join(',')})`).bind(...valid).all<ContentRow>();
    const tools=new Map((rows.results ?? []).map(row=>{const t=readTool(row);return [t.slug,t];}));return valid.flatMap(s=>tools.get(s)?[tools.get(s)!]:[]);
  }
  async adminPage(limit=50,after=''):Promise<{tools:Tool[];nextCursor:string|null}> {
    const size=Math.max(1,Math.min(limit,100));
    const rows=await this.db.prepare('SELECT content_json,published_at,updated_at FROM managed_tools WHERE slug>? ORDER BY slug LIMIT ?').bind(after,size+1).all<ContentRow>();
    const found=(rows.results ?? []).map(readTool);return {tools:found.slice(0,size),nextCursor:found.length>size?found[size-1].slug:null};
  }
  async duplicate(key:string,excludeSlug=''):Promise<boolean> {
    return !!await this.db.prepare("SELECT slug FROM managed_tools WHERE dedupe_key=? AND slug!=? UNION ALL SELECT slug FROM product_identity_aliases WHERE alias_key=? AND slug!=? LIMIT 1").bind(key,excludeSlug,key,excludeSlug).first();
  }
  async sitemap(page=1):Promise<{slug:string;updated_at:string}[]> {
    const rows=await this.db.prepare(`SELECT slug,updated_at FROM managed_tools t WHERE ${PUBLIC} ORDER BY slug LIMIT 10000 OFFSET ?`).bind((Math.max(1,page)-1)*10000).all<{slug:string;updated_at:string}>();return rows.results ?? [];
  }
  async events(limit=30,week=''):Promise<{id:number;slug:string;kind:string;name:string;summary:string;category:string;created_at:string}[]> {
    const conditions=[PUBLIC],values:(string|number)[]=[];
    if(week){conditions.push('e.created_at>=? AND e.created_at<?');values.push(week,new Date(Date.parse(week)+7*86_400_000).toISOString());}
    const rows=await this.db.prepare(`SELECT e.id,e.slug,e.kind,e.name,e.summary,e.category,e.created_at FROM tool_events e JOIN managed_tools t ON t.slug=e.slug
      WHERE ${conditions.join(' AND ')} ORDER BY e.created_at DESC,e.id DESC LIMIT ?`).bind(...values,Math.max(1,Math.min(limit,100))).all<{id:number;slug:string;kind:string;name:string;summary:string;category:string;created_at:string}>();
    return rows.results ?? [];
  }
}
