-- Pending credentials are activated only by their matching email verification.
ALTER TABLE email_verifications ADD COLUMN purpose TEXT NOT NULL DEFAULT 'verify';
ALTER TABLE email_verifications ADD COLUMN password_hash TEXT;
ALTER TABLE email_verifications ADD COLUMN password_salt TEXT;
ALTER TABLE accounts ADD COLUMN last_seen_at TEXT;

UPDATE email_verifications
SET password_hash = (SELECT password_hash FROM accounts WHERE id = account_id AND email_verified_at IS NULL AND google_sub IS NULL),
    password_salt = (SELECT password_salt FROM accounts WHERE id = account_id AND email_verified_at IS NULL AND google_sub IS NULL);

-- Legacy Google/password combinations cannot distinguish verified credentials
-- from the old pre-registration flaw. Revoke them; owners can set a fresh password
-- through the verified email reset flow. Keep verified password-only accounts.
DELETE FROM auth_sessions WHERE account_id IN
  (SELECT id FROM accounts WHERE google_sub IS NOT NULL AND password_hash IS NOT NULL);
DELETE FROM email_verifications WHERE account_id IN
  (SELECT id FROM accounts WHERE google_sub IS NOT NULL);
UPDATE accounts SET password_hash = NULL, password_salt = NULL
WHERE email_verified_at IS NULL OR google_sub IS NOT NULL;

CREATE INDEX email_verifications_account_purpose ON email_verifications(account_id, purpose);
ALTER TABLE auth_rate_limits ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0;

CREATE TABLE notification_outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  recipient TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  submission_id INTEGER REFERENCES submissions(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','accepted','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  lease_until TEXT,
  lease_token TEXT,
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  message_id TEXT,
  last_error TEXT
);
CREATE INDEX notification_ready ON notification_outbox(state, next_attempt_at);
CREATE INDEX notification_submission ON notification_outbox(submission_id, created_at);

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  credential_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);

CREATE TABLE anonymous_voters (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX anonymous_voters_expiry ON anonymous_voters(expires_at);
