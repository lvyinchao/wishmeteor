-- Account-bound OAuth 2.1. Credentials are random opaque values stored as hashes.
CREATE TABLE mcp_clients(id TEXT PRIMARY KEY,name TEXT NOT NULL,redirects TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE mcp_authorizations(id TEXT PRIMARY KEY,client_id TEXT NOT NULL REFERENCES mcp_clients(id),account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,redirect_uri TEXT NOT NULL,state TEXT NOT NULL,challenge TEXT NOT NULL,scope TEXT NOT NULL,audience TEXT NOT NULL,csrf_hash TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT);
CREATE TABLE mcp_grants(id TEXT PRIMARY KEY,client_id TEXT NOT NULL REFERENCES mcp_clients(id),account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,scope TEXT NOT NULL,audience TEXT NOT NULL,issuer TEXT NOT NULL,created_at TEXT NOT NULL,revoked_at TEXT);
CREATE INDEX mcp_grants_account ON mcp_grants(account_id);
CREATE TABLE mcp_codes(hash TEXT PRIMARY KEY,grant_id TEXT NOT NULL REFERENCES mcp_grants(id) ON DELETE CASCADE,redirect_uri TEXT NOT NULL,challenge TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT);
CREATE TABLE mcp_tokens(hash TEXT PRIMARY KEY,grant_id TEXT NOT NULL REFERENCES mcp_grants(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('access','refresh')),expires_at TEXT NOT NULL,used_at TEXT);
CREATE INDEX mcp_tokens_grant ON mcp_tokens(grant_id);
CREATE TRIGGER mcp_recovery AFTER UPDATE OF password_hash,email,email_verified_at,google_sub ON accounts
WHEN OLD.password_hash IS NOT NEW.password_hash OR OLD.email IS NOT NEW.email OR OLD.email_verified_at IS NOT NEW.email_verified_at OR OLD.google_sub IS NOT NEW.google_sub
BEGIN UPDATE mcp_grants SET revoked_at=COALESCE(revoked_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE account_id=NEW.id; END;
ALTER TABLE submissions ADD COLUMN mcp_idempotency_key TEXT;
ALTER TABLE submissions ADD COLUMN mcp_payload_hash TEXT;
ALTER TABLE submissions ADD COLUMN listing_identity TEXT;
ALTER TABLE submissions ADD COLUMN mcp_grant_id TEXT;
ALTER TABLE submissions ADD COLUMN screenshot_hash TEXT;
ALTER TABLE submissions ADD COLUMN source_links TEXT NOT NULL DEFAULT '[]';
ALTER TABLE submissions ADD COLUMN name_keys TEXT NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX mcp_submission_idempotency ON submissions(account_id,mcp_idempotency_key) WHERE mcp_idempotency_key IS NOT NULL;
-- Durable guard: name/alias checks and the insert are a single transaction.
-- An approved submission precedes its own catalog insert, so exclude that row.
CREATE TRIGGER mcp_name_dedupe BEFORE INSERT ON submissions WHEN NEW.mcp_idempotency_key IS NOT NULL AND (
 EXISTS(SELECT 1 FROM managed_tools t JOIN json_each(NEW.name_keys) n WHERE t.approved=1 AND t.status!='archived' AND (lower(trim(json_extract(t.content_json,'$.name')))=n.value OR EXISTS(SELECT 1 FROM json_each(t.content_json,'$.aliases') a WHERE lower(trim(a.value))=n.value)))
 OR EXISTS(SELECT 1 FROM submissions s JOIN json_each(NEW.name_keys) n WHERE s.verdict='pending' AND s.account_id=NEW.account_id AND (lower(trim(s.name))=n.value OR EXISTS(SELECT 1 FROM json_each(s.name_keys) a WHERE a.value=n.value)))
) BEGIN SELECT RAISE(ABORT,'mcp-duplicate-name'); END;

CREATE TRIGGER mcp_submission_authorization BEFORE INSERT ON submissions WHEN NEW.mcp_idempotency_key IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM mcp_grants g JOIN accounts a ON a.id=g.account_id WHERE g.id=NEW.mcp_grant_id AND g.account_id=NEW.account_id AND g.revoked_at IS NULL AND a.email_verified_at IS NOT NULL AND instr(' '||g.scope||' ',' submissions:write ')>0
) BEGIN SELECT RAISE(ABORT,'mcp-authorization-revoked'); END;
