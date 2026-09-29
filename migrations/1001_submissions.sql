-- Wish submissions. This is the only table the site writes to.
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  email TEXT,
  category TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  verdict TEXT NOT NULL DEFAULT 'pending' CHECK (verdict IN ('pending', 'approved', 'rejected')),
  verdict_at TEXT,
  notified_at TEXT
);

CREATE INDEX IF NOT EXISTS submissions_verdict_idx ON submissions (verdict, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS submissions_domain_pending_idx ON submissions (domain) WHERE verdict = 'pending';
