import test from 'node:test';
import assert from 'node:assert/strict';
import { environment,auth,googleRequest,verificationToken } from './harness.mjs';
const password='isolated-owner-password';

test('Google association cannot activate a pre-registration password or its old token',async()=>{
  const env=environment(),email='isolated-victim@gmail.com';
  assert.equal((await auth(env,'/api/auth/register',{email,password})).status,201);
  const token=verificationToken(env,email);
  assert.equal(env.DB.sqlite.prepare('SELECT password_hash FROM accounts WHERE email=?').get(email).password_hash,null);
  assert.equal((await auth(env,'/api/auth/login',{email,password})).status,403);
  assert.equal((await googleRequest(env,email)).status,200);
  const after=await auth(env,'/api/auth/login',{email,password});assert.equal(after.status,401);assert.equal(after.headers.get('set-cookie'),null);
  assert.match((await auth(env,'/api/auth/verify?token='+token)).headers.get('location'),/verified=expired/);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM email_verifications').get().n,0);
});

test('email verification activates only its pending credential and is single-use',async()=>{
  const env=environment(),email='owner@example.com';
  await auth(env,'/api/auth/register',{email,password});const token=verificationToken(env,email);
  assert.match((await auth(env,'/api/auth/verify?token='+token)).headers.get('location'),/verified=success/);
  assert.equal((await auth(env,'/api/auth/login',{email,password})).status,200);
  assert.match((await auth(env,'/api/auth/verify?token='+token)).headers.get('location'),/verified=expired/);
});

test('resending a verification does not change the pending password',async()=>{
  const env=environment(),email='resend@example.com';await auth(env,'/api/auth/register',{email,password});
  const oldToken=verificationToken(env,email),before=env.DB.sqlite.prepare('SELECT password_hash FROM email_verifications').get().password_hash;
  assert.equal((await auth(env,'/api/auth/resend',{email,password:'untrusted-replacement'})).status,202);
  assert.equal(env.DB.sqlite.prepare('SELECT password_hash FROM email_verifications').get().password_hash,before);
  assert.match((await auth(env,'/api/auth/verify?token='+oldToken)).headers.get('location'),/expired/);
  await auth(env,'/api/auth/verify?token='+verificationToken(env,email));assert.equal((await auth(env,'/api/auth/login',{email,password})).status,200);
});

test('a verified account requires its existing password to associate Google',async()=>{
  const env=environment(),email='link-owner@gmail.com';await auth(env,'/api/auth/register',{email,password});await auth(env,'/api/auth/verify?token='+verificationToken(env,email));
  let result=await googleRequest(env,email);assert.equal(result.status,409);assert.equal((await result.json()).error,'account-link-required');
  assert.equal((await googleRequest(env,email,{},'wrong-password')).status,409);
  assert.equal((await googleRequest(env,email,{},password)).status,200);
  assert.equal((await auth(env,'/api/auth/login',{email,password})).status,200);
});

test('third-party Google email needs an email challenge before a session is issued',async()=>{
  const env=environment(),email='third-party@example.com';const result=await googleRequest(env,email);
  assert.equal(result.status,202);assert.equal((await result.json()).message,'email-verification-required');assert.doesNotMatch(result.headers.get('set-cookie') ?? '',/__Host-wm_session/);
  assert.equal(env.DB.sqlite.prepare('SELECT email_verified_at FROM accounts').get().email_verified_at,null);
  await auth(env,'/api/auth/verify?token='+verificationToken(env,email));assert.equal((await googleRequest(env,email)).status,200);
});

test('email owner registration removes an unverified third-party Google association',async()=>{
  const env=environment(),email='new-owner@example.com';await googleRequest(env,email);
  await auth(env,'/api/auth/register',{email,password});await auth(env,'/api/auth/verify?token='+verificationToken(env,email));
  assert.equal(env.DB.sqlite.prepare('SELECT google_sub FROM accounts').get().google_sub,null);
  assert.equal((await auth(env,'/api/auth/login',{email,password})).status,200);
  assert.equal((await googleRequest(env,email)).status,409);
});

test('reset is single-use, changes the password, and revokes existing sessions',async()=>{
  const env=environment(),email='reset@example.com';await auth(env,'/api/auth/register',{email,password});await auth(env,'/api/auth/verify?token='+verificationToken(env,email));
  const login=await auth(env,'/api/auth/login',{email,password});const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await auth(env,'/api/auth/reset/request',{email})).status,202);const token=verificationToken(env,email,'reset');
  assert.equal((await auth(env,'/api/auth/reset/complete',{token,password:'new-owner-password'})).status,200);
  assert.equal((await auth(env,'/api/auth/reset/complete',{token,password:'newer-password'})).status,400);
  assert.equal((await auth(env,'/api/auth/me',undefined,{cookie})).status,200);
  assert.equal((await (await auth(env,'/api/auth/me',undefined,{cookie})).json()).account,null);
  assert.equal((await auth(env,'/api/auth/login',{email,password})).status,401);
  assert.equal((await auth(env,'/api/auth/login',{email,password:'new-owner-password'})).status,200);
});

test('Google login racing pending registration prevents later credential activation',async()=>{
  const env=environment(),email='registration-race@gmail.com';let googleStatus;
  env.DB.beforeBatch=async statements=>{
    if(!statements.some(s=>s.sql.includes('INSERT INTO email_verifications')))return;
    env.DB.beforeBatch=null;googleStatus=(await googleRequest(env,email)).status;
  };
  assert.equal((await auth(env,'/api/auth/register',{email,password})).status,409);assert.equal(googleStatus,200);
  assert.equal((await auth(env,'/api/auth/login',{email,password})).status,401);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM email_verifications').get().n,0);
});

test('verification racing Google association retains verified owner credential and rejects implicit linking',async()=>{
  const env=environment(),email='verification-race@gmail.com';await auth(env,'/api/auth/register',{email,password});const token=verificationToken(env,email);
  env.DB.beforeBatch=async statements=>{
    if(!statements.some(s=>s.sql.includes('UPDATE accounts SET google_sub=')))return;
    env.DB.beforeBatch=null;await auth(env,'/api/auth/verify?token='+token);
  };
  assert.equal((await googleRequest(env,email)).status,409);assert.equal((await auth(env,'/api/auth/login',{email,password})).status,200);
  assert.equal(env.DB.sqlite.prepare('SELECT google_sub FROM accounts').get().google_sub,null);
});

test('runtime input validation returns 400 and enforces origin and body length',async()=>{
  const env=environment();assert.equal((await auth(env,'/api/auth/register',{email:7,password})).status,400);
  assert.equal((await auth(env,'/api/auth/register',{email:'test@example.com',password:'short'})).status,400);
  assert.equal((await auth(env,'/api/auth/register',{email:'test@example.com',password},{headers:{origin:'https://other.example.com'}})).status,403);
  assert.equal((await auth(env,'/api/auth/register',{email:'test@example.com',password,padding:'x'.repeat(9000)})).status,413);
});

test('legacy security migration revokes ambiguous Google passwords and sessions only',()=>{
  const env=environment({beforeMigration(sqlite,name){if(!name.startsWith('1008'))return;const now=new Date().toISOString();
    sqlite.prepare('INSERT INTO accounts(id,email,password_hash,password_salt,google_sub,email_verified_at,created_at) VALUES(?,?,?,?,?,?,?)').run('legacy-google','legacy-google@gmail.com','legacy-hash','legacy-salt','legacy-sub',now,now);
    sqlite.prepare('INSERT INTO accounts(id,email,password_hash,password_salt,email_verified_at,created_at) VALUES(?,?,?,?,?,?)').run('verified-password','password@example.com','verified-hash','verified-salt',now,now);
    sqlite.prepare('INSERT INTO auth_sessions(token_hash,account_id,created_at,expires_at) VALUES(?,?,?,?)').run('legacy-token','legacy-google',now,'2099-01-01');
  }});
  assert.equal(env.DB.sqlite.prepare('SELECT password_hash FROM accounts WHERE id=?').get('legacy-google').password_hash,null);
  assert.equal(env.DB.sqlite.prepare('SELECT password_hash FROM accounts WHERE id=?').get('verified-password').password_hash,'verified-hash');
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n,0);
});
