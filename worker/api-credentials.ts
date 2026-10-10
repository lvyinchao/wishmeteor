import { getSessionAccount,type Account,type AuthEnv } from './auth.ts';
import { HttpError,json } from './http.ts';
import { sha256 } from './security.ts';
import { automaticSubmissionAccount } from './submission-policy.ts';

interface CredentialAccount extends Account {
  credential_id:string;
  credential_name:string;
  credential_expires_at:string|null;
}

export async function getApiCredentialAccount(request:Request,env:AuthEnv):Promise<CredentialAccount|null> {
  const authorization=request.headers.get('authorization');
  if(authorization===null)return null;
  const match=/^Bearer (wm_live_[a-f0-9]{64})$/i.exec(authorization);
  if(!match)throw new HttpError('invalid-api-token',401);
  const account=await env.DB.prepare(`SELECT a.id,a.email,a.display_name,a.password_hash,a.password_salt,a.google_sub,a.email_verified_at,
    c.id AS credential_id,c.name AS credential_name,c.expires_at AS credential_expires_at
    FROM account_api_credentials c JOIN accounts a ON a.id=c.account_id
    WHERE c.token_hash=? AND c.scope='submissions' AND c.revoked_at IS NULL
    AND (c.expires_at IS NULL OR c.expires_at>?) AND a.email_verified_at IS NOT NULL`)
    .bind(await sha256(match[1]),new Date().toISOString()).first<CredentialAccount>();
  if(!account)throw new HttpError('invalid-api-token',401);
  return account;
}

export async function submissionAccount(request:Request,env:AuthEnv):Promise<Account|null> {
  return await getApiCredentialAccount(request,env) ?? await getSessionAccount(request,env);
}

export async function handleApiCredential(request:Request,env:AuthEnv):Promise<Response> {
  if(!['GET','DELETE'].includes(request.method))return json({error:'method-not-allowed'},405,{'allow':'GET, DELETE'});
  const account=await getApiCredentialAccount(request,env);
  if(!account)throw new HttpError('api-token-required',401);
  if(request.method==='DELETE') {
    await env.DB.prepare('UPDATE account_api_credentials SET revoked_at=? WHERE id=? AND account_id=? AND revoked_at IS NULL')
      .bind(new Date().toISOString(),account.credential_id,account.id).run();
    return json({ok:true});
  }
  const automatic=automaticSubmissionAccount(account);
  return json({account:{email:account.email,submissionPolicy:{automaticApproval:automatic,rateLimited:!automatic,dofollow:automatic}},
    token:{id:account.credential_id,name:account.credential_name,expiresAt:account.credential_expires_at,scopes:['submissions:write','submissions:read']}});
}
