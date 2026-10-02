import { readFileSync,mkdirSync,writeFileSync,rmSync,existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
export function validateManifest(raw) {
 if(raw?.version!==1||!Array.isArray(raw.files)||!raw.files.length||!Array.isArray(raw.migrations))throw new Error('invalid-release-manifest');
 const files=[...new Set(raw.files)];if(files.length!==raw.files.length)throw new Error('duplicate-release-path');
 for(const file of files) {
  if(typeof file!=='string'||file.startsWith('/')||file.startsWith('-')||file.includes('\\')||file.split('/').some(part=>!part||part==='.'||part==='..')||/[\r\n\0]/.test(file))throw new Error('invalid-release-path');
  if(/^(?:data|\.env|\.dev\.vars|\.wrangler|node_modules|dist|private|reviews)(?:\/|\.|$)/.test(file)||/(?:secret|token|private-review|snapshot\.(?:json|jsonl|csv|sql|md)$|\.pem$)/i.test(file))throw new Error('private-release-path');
  if(!/^(?:src\/|public\/|worker\/|scripts\/|migrations\/|integrations\/|docs\/|tests\/|\.github\/|package\.json$|pnpm-lock\.yaml$|astro\.config\.mjs$|wrangler\.jsonc$|README\.md$|\.gitignore$|tsconfig\.json$)/.test(file))throw new Error('unrecognized-release-path');
 }
 if(raw.migrations.some(path=>!files.includes(path)||!/^migrations\/\d+_[a-z0-9_]+\.sql$/.test(path)))throw new Error('invalid-release-migration');
 return {...raw,files};
}
export function command(root,program,args,{capture=false,runner=spawnSync}={}) {
 const result=runner(program,args,{cwd:root,...(capture?{encoding:'utf8',maxBuffer:16*1024*1024}:{stdio:'inherit'})});
 if(result.status!==0)throw new Error(program+'-failed-exit-'+(result.status??'unknown'));return capture?result.stdout.trim():'';
}
export function acquireLock(root,{recover=false,pid=process.pid,host=hostname(),alive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}}}={}) {
 const lock=join(root,'data/.release-lock');mkdirSync(join(root,'data'),{recursive:true});
 if(existsSync(lock)) {
  let owner;try{owner=JSON.parse(readFileSync(join(lock,'owner.json'),'utf8'));}catch{}
  if(!recover)throw new Error('release-lock-exists-use-recover-lock-after-inspection');
  if(!owner||owner.host!==host||!Number.isSafeInteger(owner.pid)||alive(owner.pid))throw new Error('release-lock-owner-may-be-active');
  rmSync(lock,{recursive:true});
 }
 mkdirSync(lock);const id=crypto.randomUUID();writeFileSync(join(lock,'owner.json'),JSON.stringify({id,pid,host,createdAt:new Date().toISOString()}),{mode:0o600});
 return ()=>{try{if(JSON.parse(readFileSync(join(lock,'owner.json'),'utf8')).id===id)rmSync(lock,{recursive:true});}catch{}};
}
export function stagedPaths(root,run=command){return run(root,'git',['diff','--cached','--name-only','-z'],{capture:true}).split('\0').filter(Boolean);}
export function assertStaging(root,manifest,run=command) {const unexpected=stagedPaths(root,run).filter(path=>!manifest.files.includes(path));if(unexpected.length)throw new Error('unrelated-staged-paths: '+unexpected.join(', '));}

export function sourceFingerprint(root,manifest,run=command) {
 const hash=createHash('sha256');hash.update(run(root,'git',['status','--porcelain=v1','-z'],{capture:true}));hash.update(run(root,'git',['diff','--binary','HEAD'],{capture:true}));
 for(const path of manifest.files){const file=join(root,path);hash.update(path+'\0');hash.update(existsSync(file)?readFileSync(file):'deleted');}return hash.digest('hex');
}
