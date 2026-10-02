-- A UNIQUE nonce and the content write are committed in the same D1 batch.
-- Reusing a signed result fails the batch, including concurrent replays.
CREATE TABLE IF NOT EXISTS link_verification_nonces (
  nonce TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS link_verification_expiry ON link_verification_nonces(expires_at);
