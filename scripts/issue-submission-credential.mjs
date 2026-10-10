import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { writeFileSync,readFileSync,mkdtempSync,rmSync,chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const args=process.argv.slice(2),value=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
const email=value('--email')?.trim().toLowerCase(),output=value('--output'),name=value('--name') ?? 'Submission API';
if(!email||!output||!args.includes('--remote')||!/^\S+@\S+\.\S+$/.test(email)||name.length>80)throw Error('Use --remote --email <verified email> --output <private token file> [--name <label>]');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const run=options=>{
  const result=execFileSync('pnpm',['exec','wrangler','d1','execute','wishmeteor','--remote','--json',...options],{encoding:'utf8',maxBuffer:4*1024*1024});
  // SQL-file execution emits progress before its JSON. Confirm writes with a separate query.
  return options.includes('--file')?undefined:JSON.parse(result);
};
const rows=result=>{if(result.some(item=>!item.success))throw Error('Database operation failed');return result.flatMap(item=>item.results ?? []);};
const accounts=rows(run(['--command',`SELECT id,email FROM accounts WHERE email=${quote(email)} AND email_verified_at IS NOT NULL`]));
if(accounts.length!==1)throw Error('Verified account not found');
const account=accounts[0],token='wm_live_'+randomBytes(32).toString('hex'),id=randomUUID(),now=new Date().toISOString();
const hash=createHash('sha256').update(token).digest('hex'),file=resolve(output),temporary=mkdtempSync(join(tmpdir(),'wishmeteor-credential-'));
chmodSync(temporary,0o700);
// Persist before registration, so an uncertain remote response cannot lose the credential.
writeFileSync(file,token+'\n',{mode:0o600,flag:'wx'});
try {
  const sql=join(temporary,'issue.sql');
  writeFileSync(sql,`INSERT INTO account_api_credentials(id,account_id,token_hash,name,token_prefix,created_at)
    SELECT ${quote(id)},id,${quote(hash)},${quote(name)},${quote(token.slice(0,16))},${quote(now)}
    FROM accounts WHERE id=${quote(account.id)} AND email=${quote(email)} AND email_verified_at IS NOT NULL;`,{mode:0o600});
  run(['--file',sql,'--yes']);
  const confirmed=rows(run(['--command',`SELECT id,account_id,revoked_at FROM account_api_credentials WHERE id=${quote(id)} AND token_hash=${quote(hash)}`]));
  if(confirmed.length!==1||confirmed[0].account_id!==account.id||confirmed[0].revoked_at)throw Error('Credential registration not confirmed');
  // Never print the credential or pass it as a subprocess argument.
  if(readFileSync(file,'utf8').trim()!==token)throw Error('Private credential file changed');
  console.log(JSON.stringify({id,email,tokenFile:file,scopes:['submissions:write','submissions:read'],expiresAt:null}));
} catch(error) {
  console.error('Registration was not confirmed. The private file was preserved; inspect credential id '+id+' before retrying.');
  throw error;
} finally {rmSync(temporary,{recursive:true,force:true});}
