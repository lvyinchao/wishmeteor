#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { signedCheck } from './lib/sign-proof.mjs';
const [slug,url,output]=process.argv.slice(2);
if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug??'')||!url||!output)throw new Error('usage: node scripts/sign-verification.mjs SLUG HTTPS_URL OUTPUT_JSON');
const proof=await signedCheck(slug,url);writeFileSync(resolve(output),JSON.stringify(proof,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(`Signed ${proof.state} outcome; proof is valid for 10 minutes.`);
