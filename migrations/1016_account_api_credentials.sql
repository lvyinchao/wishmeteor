-- Opaque submission credentials: only hashes are stored in the database.
CREATE TABLE account_api_credentials (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  name TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'submissions' CHECK(scope='submissions'),
  created_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT
);
CREATE INDEX account_api_credentials_owner ON account_api_credentials(account_id);

-- Account recovery or identity changes invalidate existing API access too.
CREATE TRIGGER account_api_credentials_recovery
AFTER UPDATE OF password_hash,email,email_verified_at ON accounts
WHEN OLD.password_hash IS NOT NEW.password_hash
  OR OLD.email IS NOT NEW.email
  OR OLD.email_verified_at IS NOT NEW.email_verified_at
BEGIN
  UPDATE account_api_credentials
  SET revoked_at=COALESCE(revoked_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  WHERE account_id=NEW.id;
END;
