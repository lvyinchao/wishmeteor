#!/usr/bin/env node
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { parseArgs } from './lib/cli.mjs';
import { validateManifest,command,acquireLock,assertStaging,stagedPaths,sourceFingerprint } from './lib/release.mjs';
import { PATHS } from '../src/lib/catalog.mjs';
import { adminClient } from './lib/admin-api.mjs';
const args=parseArgs(),root=PATHS.root;
const manifest=validateManifest(JSON.parse(readFileSync(resolve(String(args.manifest??'docs/release-manifest.json')),'utf8')));
const states={check:'pending',build:'pending',commit:'not-requested',push:'not-requested',migrate:'not-requested',backfill:'not-requested',deploy:'not-requested',readback:'not-requested',notify:'not-requested'};
if((args.deploy||args.migrate||args.notify)&&!args['production-authorized'])throw new Error('production-actions-require-explicit-authorized-release');
if(args.notify&&!args.deploy)throw new Error('notification-stage-requires-deploy-and-readback');
if(args.deploy&&(!args.push||!args.commit))throw new Error('deployment-requires-scoped-commit-and-push');
if(args.migrate&&(!args['backfill-plan']||!args.deploy))throw new Error('migration-requires-reviewed-backfill-plan-and-deployment');
const release=acquireLock(root,{recover:!!args['recover-lock']});
let failedStage=null,revision=null;
const finish=()=>release();process.once('SIGINT',()=>{finish();process.exit(130);});process.once('SIGTERM',()=>{finish();process.exit(143);});
function step(name,program,arguments_){failedStage=name;states[name]='running';command(root,program,arguments_);states[name]='succeeded';failedStage=null;}
try {
 revision=command(root,'git',['rev-parse','HEAD'],{capture:true});
 assertStaging(root,manifest);
 const before=sourceFingerprint(root,manifest);
 step('check','pnpm',['check']);step('check','pnpm',['check:worker']);step('check','pnpm',['test']);step('build','pnpm',['build']);step('build','pnpm',['exec','wrangler','deploy','--dry-run']);
 const after=sourceFingerprint(root,manifest);if(before!==after)throw new Error('build-dirtied-source');
 if(args.commit) {
  failedStage='commit';command(root,'git',['add','--',...manifest.files]);assertStaging(root,manifest);
  if(stagedPaths(root).length)step('commit','git',['commit','-m',String(args.message??'feat: complete trusted WishMeteor publication and discovery')]);else states.commit='unchanged';
  revision=command(root,'git',['rev-parse','HEAD'],{capture:true});failedStage=null;
 }
 if(args.push){const branch=command(root,'git',['symbolic-ref','--short','HEAD'],{capture:true});step('push','git',['push','-u','origin',branch]);}
 if(args.migrate){step('migrate','pnpm',['exec','wrangler','d1','migrations','apply','wishmeteor','--remote']);step('backfill',process.execPath,['scripts/backfill-catalog.mjs','--apply='+String(args['backfill-plan']),'--write']);}
 if(args.deploy) {
  const tracked=command(root,'git',['status','--porcelain=v1','--untracked-files=no'],{capture:true});if(tracked)throw new Error('deployment-requires-clean-tracked-worktree');
  step('deploy','pnpm',['exec','wrangler','deploy','--var','RELEASE_REVISION:'+revision]);
  failedStage='readback';states.readback='running';
  for(const path of manifest.publicChecks??['/','/api/content','/sitemap-tools.xml']){const response=await fetch('https://wishmeteor.net'+path,{redirect:'error',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!response.ok||response.headers.get('x-release-revision')!==revision)throw new Error('release-readback-failed: '+path);await response.body?.cancel();}
  states.readback='succeeded';failedStage=null;
 }
 if(args.notify)step('notify',process.execPath,['scripts/notify.mjs','--write']);
} catch(error){if(failedStage)states[failedStage]='failed';states.error=error.message;process.exitCode=1;}
finally {
 release();const record={revision,states,createdAt:new Date().toISOString()};mkdirSync(join(root,'data/cache'),{recursive:true});writeFileSync(join(root,'data/cache','release-'+Date.now()+'.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(record,null,2));
 if(states.deploy==='succeeded'){try{await adminClient({...args,write:true}).request('/api/admin/releases',{revision,states});}catch{console.error('Release ran; operations record could not be saved. Local state report is preserved.');}}
}
