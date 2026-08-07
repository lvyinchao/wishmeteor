CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  locale TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS anonymous_sessions (
  id TEXT PRIMARY KEY,
  credits_remaining INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT
);
CREATE TABLE IF NOT EXISTS creations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_type TEXT NOT NULL CHECK(owner_type IN ('user','anonymous')),
  kind TEXT NOT NULL CHECK(kind IN ('blessing','wish','card')),
  locale TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  share_slug TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS wishes (
  id TEXT PRIMARY KEY,
  creation_id TEXT NOT NULL REFERENCES creations(id),
  status TEXT NOT NULL CHECK(status IN ('private','published','pending','blocked','removed')),
  theme TEXT,
  support_count INTEGER NOT NULL DEFAULT 0,
  published_at TEXT
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  wish_id TEXT NOT NULL REFERENCES wishes(id),
  reason TEXT NOT NULL,
  reporter_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS moderation_events (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  verdict TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
