import type { Tool } from '../src/lib/tool-schema.ts';
import type { Env } from './env.ts';
export function eventStatement(env:Env,tool:Tool,kind:string,now:string):D1PreparedStatement {
  return env.DB.prepare(`INSERT INTO tool_events(slug,kind,name,summary,category,created_at)
    SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM managed_tools WHERE slug=? AND json_extract(content_json,'$.contentVersion')=?)`)
    .bind(tool.slug,kind,tool.name,tool.summary,tool.category,now,tool.slug,tool.contentVersion!);
}
export function cardStatement(env:Env,tool:Tool,now:string):D1PreparedStatement {
  return env.DB.prepare(`INSERT INTO tool_cards(slug,version,card_json,created_at)
    SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM managed_tools WHERE slug=? AND json_extract(content_json,'$.contentVersion')=?)`)
    .bind(tool.slug,tool.contentVersion!,JSON.stringify(tool),now,tool.slug,tool.contentVersion!);
}
