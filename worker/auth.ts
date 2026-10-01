const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const SESSION_COOKIE = '__Host-wm_session';
const GOOGLE_NONCE_COOKIE = '__Host-wm_google_nonce';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const encoder = new TextEncoder();

export interface AuthEnv {
  DB: D1Database;
  EMAIL?: SendEmail;
  GOOGLE_CLIENT_ID?: string;
  APP_ORIGIN?: string;
}

interface Account {
  id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  password_salt: string | null;
  google_sub: string | null;
  email_verified_at: string | null;
}

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(JSON_HEADERS);
  new Headers(headers).forEach((value, name) => responseHeaders.append(name, value));
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

function cookie(request: Request, name: string): string | null {
  const prefix = `${name}=`;
  return (request.headers.get('cookie') ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function emailValid(value: string): boolean {
  return value.length <= 254 && /^[^\s@]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);
}

async function body(request: Request): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return null;
  const text = await request.text().catch(() => '');
  if (!text || text.length > 8192) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !!origin && origin === new URL(request.url).origin;
}

async function rateLimit(request: Request, env: AuthEnv, action: string, identity: string, maximum: number): Promise<boolean> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const key = await sha256(`wishmeteor-auth:${action}:${ip}:${identity}`);
  const now = Date.now();
  const start = now - RATE_WINDOW_MS;
  await env.DB.prepare(
    `INSERT INTO auth_rate_limits (rate_key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(rate_key) DO UPDATE SET
       count = CASE WHEN auth_rate_limits.window_start <= ? THEN 1 ELSE auth_rate_limits.count + 1 END,
       window_start = CASE WHEN auth_rate_limits.window_start <= ? THEN excluded.window_start ELSE auth_rate_limits.window_start END`
  ).bind(key, now, start, start).run();
  const current = await env.DB.prepare('SELECT count FROM auth_rate_limits WHERE rate_key = ?').bind(key).first<{ count: number }>();
  // Keep the bounded throttle table tidy without a scheduled job.
  await env.DB.prepare('DELETE FROM auth_rate_limits WHERE window_start < ?').bind(now - 2 * RATE_WINDOW_MS).run();
  return (current?.count ?? maximum + 1) <= maximum;
}

async function derivePassword(password: string, saltHex: string): Promise<string> {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
  // Workers rejects any single PBKDF2 WebCrypto operation above 100,000
  // iterations. Chain six domain-separated 100,000-round operations to keep
  // the intended 600,000-round work factor within that per-operation limit.
  let input = encoder.encode(password);
  for (let round = 0; round < 6; round += 1) {
    const key = await crypto.subtle.importKey('raw', input, 'PBKDF2', false, ['deriveBits']);
    const roundSalt = new Uint8Array(salt.length + 1);
    roundSalt.set(salt);
    roundSalt[salt.length] = round;
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: roundSalt, iterations: 100_000 },
      key,
      256,
    );
    input = new Uint8Array(bits);
  }
  return [...input].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function createSession(accountId: string, env: AuthEnv): Promise<string> {
  const token = randomToken();
  const now = new Date();
  await env.DB.prepare('INSERT INTO auth_sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), accountId, now.toISOString(), new Date(now.getTime() + SESSION_TTL_MS).toISOString()).run();
  return token;
}

function setSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; HttpOnly; Secure; SameSite=Lax`;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function sessionAccount(request: Request, env: AuthEnv): Promise<Account | null> {
  const token = cookie(request, SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return env.DB.prepare(
    `SELECT a.id, a.email, a.display_name, a.password_hash, a.password_salt, a.google_sub, a.email_verified_at
     FROM auth_sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND a.email_verified_at IS NOT NULL`
  ).bind(await sha256(token), new Date().toISOString()).first<Account>();
}

export async function getSessionAccountId(request: Request, env: AuthEnv): Promise<string | null> {
  return (await sessionAccount(request, env))?.id ?? null;
}

function publicAccount(account: Account) {
  return { id: account.id, email: account.email, name: account.display_name };
}

async function sendVerification(request: Request, env: AuthEnv, accountId: string, email: string): Promise<void> {
  if (!env.EMAIL) throw new Error('Email sending is not configured');
  const token = randomToken();
  const now = new Date();
  const hash = await sha256(token);
  await env.DB.prepare('DELETE FROM email_verifications WHERE account_id = ?').bind(accountId).run();
  await env.DB.prepare('INSERT INTO email_verifications (token_hash, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(hash, accountId, new Date(now.getTime() + VERIFY_TTL_MS).toISOString(), now.toISOString()).run();
  const configuredOrigin = env.APP_ORIGIN?.replace(/\/$/, '');
  const origin = configuredOrigin || new URL(request.url).origin;
  const url = `${origin}/api/auth/verify?token=${token}`;
  await env.EMAIL.send({
    to: email,
    from: 'support@wishmeteor.net',
    subject: 'Verify your WishMeteor account',
    text: `Confirm your email address to finish creating your WishMeteor account: ${url}\n\nThis link expires in 24 hours. If you did not request this, ignore this email.`,
    html: `<p>Confirm your email address to finish creating your WishMeteor account.</p><p><a href="${url}">Verify email</a></p><p>This link expires in 24 hours. If you did not request this, ignore this email.</p>`,
  });
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function verifyGoogleIdToken(token: string, clientId: string, expectedNonce: string): Promise<{ sub: string; email: string; name: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 12_000) return null;
  let header: { alg?: string; kid?: string };
  let claims: { iss?: string; aud?: string | string[]; exp?: number; iat?: number; nonce?: string; sub?: string; email?: string; email_verified?: boolean; name?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))) as typeof header;
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as typeof claims;
  } catch {
    return null;
  }
  const audienceMatches = claims.aud === clientId || (Array.isArray(claims.aud) && claims.aud.includes(clientId));
  if (header.alg !== 'RS256' || !header.kid || !audienceMatches || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss ?? '') ||
      !Number.isFinite(claims.exp) || (claims.exp ?? 0) <= Date.now() / 1000 || !Number.isFinite(claims.iat) || (claims.iat ?? 0) > Date.now() / 1000 + 60 ||
      !constantTimeEqual(claims.nonce ?? '', expectedNonce) || !claims.sub || !claims.email || claims.email_verified !== true || !emailValid(claims.email)) return null;
  const keysResponse = await fetch('https://www.googleapis.com/oauth2/v3/certs', { cf: { cacheEverything: true } });
  if (!keysResponse.ok) return null;
  const jwks = await keysResponse.json() as { keys?: (JsonWebKey & { kid?: string; alg?: string })[] };
  const jwk = jwks.keys?.find((key) => key.kid === header.kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256'));
  if (!jwk) return null;
  const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const validSignature = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, base64UrlDecode(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  return validSignature ? { sub: claims.sub, email: claims.email.toLowerCase(), name: (claims.name ?? '').slice(0, 100) } : null;
}

async function handleRegister(request: Request, env: AuthEnv): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'origin-not-allowed' }, 403);
  const input = await body(request);
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input?.password === 'string' ? input.password : '';
  if (!emailValid(email) || password.length < 6 || password.length > 256) return json({ error: 'invalid-input' }, 400);
  if (!(await rateLimit(request, env, 'register', email, 5))) return json({ error: 'try-later' }, 429);
  const existing = await env.DB.prepare('SELECT id, email, display_name, password_hash, password_salt, google_sub, email_verified_at FROM accounts WHERE email = ?').bind(email).first<Account>();
  if (existing?.email_verified_at) return json({ error: 'account-exists' }, 409);
  const accountId = existing?.id ?? crypto.randomUUID();
  const salt = randomToken().slice(0, 32);
  const hash = await derivePassword(password, salt);
  if (existing) {
    await env.DB.prepare('UPDATE accounts SET password_hash = ?, password_salt = ? WHERE id = ?').bind(hash, salt, accountId).run();
  } else {
    await env.DB.prepare('INSERT INTO accounts (id, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(accountId, email, hash, salt, new Date().toISOString()).run();
  }
  try {
    await sendVerification(request, env, accountId, email);
  } catch (error) {
    console.error('verification email failed', error);
    return json({ error: 'email-unavailable' }, 503);
  }
  return json({ ok: true, message: 'verification-sent' }, 201);
}

async function handleLogin(request: Request, env: AuthEnv): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'origin-not-allowed' }, 403);
  const input = await body(request);
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input?.password === 'string' ? input.password : '';
  if (!emailValid(email) || password.length > 256) return json({ error: 'invalid-credentials' }, 400);
  if (!(await rateLimit(request, env, 'login', email, 10))) return json({ error: 'try-later' }, 429);
  const account = await env.DB.prepare('SELECT id, email, display_name, password_hash, password_salt, google_sub, email_verified_at FROM accounts WHERE email = ?').bind(email).first<Account>();
  const candidateHash = await derivePassword(password, account?.password_salt ?? '00000000000000000000000000000000');
  if (!account?.password_hash || !constantTimeEqual(candidateHash, account.password_hash)) return json({ error: 'invalid-credentials' }, 401);
  if (!account.email_verified_at) return json({ error: 'email-not-verified' }, 403);
  await env.DB.prepare('UPDATE submissions SET account_id = ? WHERE account_id IS NULL AND email = ?').bind(account.id, account.email).run();
  const token = await createSession(account.id, env);
  return json({ ok: true, account: publicAccount(account) }, 200, { 'set-cookie': setSessionCookie(token) });
}

async function handleGoogle(request: Request, env: AuthEnv): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'origin-not-allowed' }, 403);
  if (!env.GOOGLE_CLIENT_ID) return json({ error: 'google-not-configured' }, 503);
  const input = await body(request);
  const credential = typeof input?.credential === 'string' ? input.credential : '';
  if (!credential) return json({ error: 'invalid-credential' }, 400);
  if (!(await rateLimit(request, env, 'google', 'all', 30))) return json({ error: 'try-later' }, 429);
  let identity: { sub: string; email: string; name: string } | null;
  try {
    const nonce = cookie(request, GOOGLE_NONCE_COOKIE) ?? '';
    if (!/^[a-f0-9]{64}$/.test(nonce)) return json({ error: 'invalid-credential' }, 401);
    identity = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID, nonce);
  } catch (error) {
    console.error('Google token verification failed', error);
    return json({ error: 'google-unavailable' }, 503);
  }
  if (!identity) return json({ error: 'invalid-credential' }, 401);
  let account = await env.DB.prepare('SELECT id, email, display_name, password_hash, password_salt, google_sub, email_verified_at FROM accounts WHERE google_sub = ?').bind(identity.sub).first<Account>();
  if (!account) {
    const byEmail = await env.DB.prepare('SELECT id, email, display_name, password_hash, password_salt, google_sub, email_verified_at FROM accounts WHERE email = ?').bind(identity.email).first<Account>();
    if (byEmail?.google_sub && byEmail.google_sub !== identity.sub) return json({ error: 'account-conflict' }, 409);
    const id = byEmail?.id ?? crypto.randomUUID();
    const displayName = identity.name || byEmail?.display_name || '';
    if (byEmail) {
      await env.DB.prepare('UPDATE accounts SET google_sub = ?, email_verified_at = COALESCE(email_verified_at, ?), display_name = CASE WHEN display_name = \'\' THEN ? ELSE display_name END WHERE id = ?')
        .bind(identity.sub, new Date().toISOString(), displayName, id).run();
    } else {
      await env.DB.prepare('INSERT INTO accounts (id, email, display_name, google_sub, email_verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, identity.email, displayName, identity.sub, new Date().toISOString(), new Date().toISOString()).run();
    }
    account = { id, email: identity.email, display_name: displayName, password_hash: byEmail?.password_hash ?? null, password_salt: byEmail?.password_salt ?? null, google_sub: identity.sub, email_verified_at: byEmail?.email_verified_at ?? new Date().toISOString() };
  }
  await env.DB.prepare('UPDATE submissions SET account_id = ? WHERE account_id IS NULL AND email = ?').bind(account.id, identity.email).run();
  const sessionToken = await createSession(account.id, env);
  return json({ ok: true, account: publicAccount(account) }, 200, { 'set-cookie': setSessionCookie(sessionToken) });
}

async function handleVerify(request: Request, env: AuthEnv): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const origin = (env.APP_ORIGIN || new URL(request.url).origin).replace(/\/$/, '');
  const redirect = (result: string) => new Response(null, { status: 303, headers: { location: `${origin}/account?verified=${result}`, 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' } });
  if (!/^[a-f0-9]{64}$/.test(token)) return redirect('invalid');
  const hash = await sha256(token);
  const verification = await env.DB.prepare('SELECT account_id FROM email_verifications WHERE token_hash = ? AND expires_at > ?').bind(hash, new Date().toISOString()).first<{ account_id: string }>();
  if (!verification) return redirect('expired');
  await env.DB.batch([
    env.DB.prepare('UPDATE accounts SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').bind(new Date().toISOString(), verification.account_id),
    env.DB.prepare('UPDATE submissions SET account_id = ? WHERE account_id IS NULL AND email = (SELECT email FROM accounts WHERE id = ?)').bind(verification.account_id, verification.account_id),
    env.DB.prepare('DELETE FROM email_verifications WHERE account_id = ?').bind(verification.account_id),
  ]);
  return redirect('success');
}

export async function handleAuth(request: Request, env: AuthEnv): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/auth/config' && request.method === 'GET') {
    const nonce = randomToken();
    return json({ googleClientId: env.GOOGLE_CLIENT_ID ?? '', nonce }, 200, {
      'set-cookie': `${GOOGLE_NONCE_COOKIE}=${nonce}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    });
  }
  if (pathname === '/api/auth/me' && request.method === 'GET') {
    const account = await sessionAccount(request, env);
    return json({ account: account ? publicAccount(account) : null });
  }
  if (pathname === '/api/auth/register' && request.method === 'POST') return handleRegister(request, env);
  if (pathname === '/api/auth/login' && request.method === 'POST') return handleLogin(request, env);
  if (pathname === '/api/auth/google' && request.method === 'POST') return handleGoogle(request, env);
  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    if (!sameOrigin(request)) return json({ error: 'origin-not-allowed' }, 403);
    const token = cookie(request, SESSION_COOKIE);
    if (token && /^[a-f0-9]{64}$/.test(token)) await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
  }
  if (pathname === '/api/auth/verify' && request.method === 'GET') return handleVerify(request, env);
  if (pathname.startsWith('/api/auth/')) return json({ error: 'not-found' }, 404);
  return null;
}
