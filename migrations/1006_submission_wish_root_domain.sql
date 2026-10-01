ALTER TABLE submissions ADD COLUMN make_a_wish TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN root_domain TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS submissions_root_domain_pending_idx
  ON submissions (root_domain)
  WHERE verdict = 'pending' AND root_domain IS NOT NULL;
