import { readFileSync,statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes,sign } from 'node:crypto';
import { verificationMessage } from '../../src/lib/verification.mjs';
import { inspectPublicSite } from './verify-public-site.mjs';
export async function signedCheck(slug,url,{keyPath=process.env.WISHMETEOR_VERIFIER_KEY ?? join(homedir(),'.config/wishmeteor/verifier-private.pem')}={}) {
 const info=statSync(keyPath);
 if(!info.isFile()||(info.mode&0o077)!==0||info.uid!==process.getuid())throw new Error('private-key-permissions');
 const outcome=await inspectPublicSite(url),checkedAt=Date.now();
 const proof={slug,url:outcome.url,state:outcome.state,httpStatus:outcome.httpStatus,checkedAt,expiresAt:checkedAt+600_000,nonce:randomBytes(32).toString('hex')};
 proof.signature=sign(null,Buffer.from(verificationMessage(proof)),readFileSync(keyPath)).toString('base64url');return proof;
}
