CREATE TABLE IF NOT EXISTS wish_translations (
  wish_id TEXT NOT NULL,
  target_locale TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (wish_id, target_locale)
);
