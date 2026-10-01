ALTER TABLE submissions ADD COLUMN account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE submissions ADD COLUMN submission_email_sent_at TEXT;
ALTER TABLE submissions ADD COLUMN verdict_email_sent_at TEXT;
CREATE INDEX IF NOT EXISTS submissions_account_idx ON submissions(account_id, created_at DESC);
UPDATE submissions
SET account_id = (SELECT id FROM accounts WHERE accounts.email = submissions.email AND email_verified_at IS NOT NULL)
WHERE account_id IS NULL
  AND EXISTS (SELECT 1 FROM accounts WHERE accounts.email = submissions.email AND email_verified_at IS NOT NULL);
