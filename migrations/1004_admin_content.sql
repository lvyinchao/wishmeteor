-- Content managed by the authenticated admin API. Static source files remain
-- available for the curated catalog; API-managed entries are served dynamically.
CREATE TABLE IF NOT EXISTS managed_tools (
  slug TEXT PRIMARY KEY,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS managed_tools_updated_idx ON managed_tools(updated_at DESC);
