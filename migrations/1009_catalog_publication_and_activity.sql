-- Indexed projections keep the JSON record as the authoritative content.
ALTER TABLE managed_tools ADD COLUMN approved INTEGER GENERATED ALWAYS AS (CASE WHEN json_extract(content_json, '$.approved') = 1 THEN 1 ELSE 0 END) VIRTUAL;
ALTER TABLE managed_tools ADD COLUMN status TEXT GENERATED ALWAYS AS (json_extract(content_json, '$.status')) VIRTUAL;
ALTER TABLE managed_tools ADD COLUMN category TEXT GENERATED ALWAYS AS (json_extract(content_json, '$.category')) VIRTUAL;
ALTER TABLE managed_tools ADD COLUMN pricing TEXT GENERATED ALWAYS AS (json_extract(content_json, '$.pricing')) VIRTUAL;
ALTER TABLE managed_tools ADD COLUMN origin TEXT GENERATED ALWAYS AS (json_extract(content_json, '$.origin')) VIRTUAL;
ALTER TABLE managed_tools ADD COLUMN published_at TEXT GENERATED ALWAYS AS (COALESCE(json_extract(content_json, '$.publishedAt'), created_at)) VIRTUAL;
ALTER TABLE managed_tools ADD COLUMN root_domain TEXT NOT NULL DEFAULT '';
ALTER TABLE managed_tools ADD COLUMN dedupe_key TEXT NOT NULL DEFAULT '';
ALTER TABLE managed_tools ADD COLUMN star_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE managed_tools ADD COLUMN trusted_star_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wish_stars ADD COLUMN verified_browser INTEGER NOT NULL DEFAULT 0 CHECK(verified_browser IN (0,1));
CREATE INDEX catalog_public_recent ON managed_tools(approved, status, published_at DESC, slug ASC);
CREATE INDEX catalog_category_recent ON managed_tools(category, approved, status, published_at DESC, slug ASC);
CREATE INDEX catalog_pricing_recent ON managed_tools(pricing, approved, status, published_at DESC, slug ASC);
CREATE INDEX catalog_root_domain ON managed_tools(root_domain);
CREATE UNIQUE INDEX catalog_dedupe ON managed_tools(dedupe_key) WHERE dedupe_key!='';
CREATE INDEX catalog_public_popular ON managed_tools(approved, status, trusted_star_count DESC, published_at DESC, slug ASC);
UPDATE managed_tools SET star_count=(SELECT COUNT(*) FROM wish_stars WHERE wish_stars.slug=managed_tools.slug);
CREATE TABLE star_meta(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL DEFAULT 1);
INSERT INTO star_meta(id,version) VALUES(1,1);
CREATE TRIGGER star_created_count AFTER INSERT ON wish_stars BEGIN
  UPDATE managed_tools SET star_count=star_count+1 WHERE slug=NEW.slug;
  UPDATE managed_tools SET trusted_star_count=trusted_star_count+NEW.verified_browser WHERE slug=NEW.slug;
  UPDATE star_meta SET version=version+1 WHERE id=1;
END;
CREATE TRIGGER star_deleted_count AFTER DELETE ON wish_stars BEGIN
  UPDATE managed_tools SET star_count=MAX(0,star_count-1) WHERE slug=OLD.slug;
  UPDATE managed_tools SET trusted_star_count=MAX(0,trusted_star_count-OLD.verified_browser) WHERE slug=OLD.slug;
  UPDATE star_meta SET version=version+1 WHERE id=1;
END;

CREATE TABLE catalog_meta (id INTEGER PRIMARY KEY CHECK(id = 1), version INTEGER NOT NULL DEFAULT 1);
INSERT INTO catalog_meta(id, version) VALUES(1, 1);
CREATE TRIGGER catalog_created_version AFTER INSERT ON managed_tools BEGIN
  UPDATE catalog_meta SET version = version + 1 WHERE id = 1;
END;
CREATE TRIGGER catalog_updated_version AFTER UPDATE OF content_json ON managed_tools BEGIN
  UPDATE catalog_meta SET version = version + 1 WHERE id = 1;
END;
CREATE TRIGGER catalog_deleted_version AFTER DELETE ON managed_tools BEGIN
  UPDATE catalog_meta SET version = version + 1 WHERE id = 1;
END;

ALTER TABLE submissions ADD COLUMN approved_slug TEXT;
ALTER TABLE submissions ADD COLUMN publication_operation TEXT;
ALTER TABLE submissions ADD COLUMN dedupe_key TEXT;
UPDATE submissions SET dedupe_key=COALESCE(root_domain,domain);
DROP INDEX submissions_domain_pending_idx;
DROP INDEX submissions_root_domain_pending_idx;
CREATE UNIQUE INDEX submissions_dedupe_pending ON submissions(dedupe_key) WHERE verdict='pending' AND dedupe_key IS NOT NULL;
CREATE INDEX submissions_publication_day ON submissions(verdict, verdict_at);
CREATE TABLE publication_days (
  day TEXT PRIMARY KEY,
  used INTEGER NOT NULL DEFAULT 0 CHECK(used BETWEEN 0 AND 9)
);
INSERT INTO publication_days(day, used)
SELECT substr(verdict_at,1,10), MIN(COUNT(*),9) FROM submissions
WHERE verdict = 'approved' AND verdict_at IS NOT NULL GROUP BY substr(verdict_at,1,10);

CREATE TABLE tool_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('published','updated','archived','verified')),
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX tool_events_recent ON tool_events(created_at DESC, id DESC);
CREATE INDEX tool_events_slug ON tool_events(slug, created_at DESC);

CREATE TABLE tool_cards (
  slug TEXT NOT NULL REFERENCES managed_tools(slug) ON DELETE CASCADE,
  version TEXT NOT NULL,
  card_json TEXT NOT NULL CHECK(json_valid(card_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(slug, version)
);

CREATE TABLE account_projects (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slug TEXT NOT NULL REFERENCES managed_tools(slug) ON DELETE CASCADE,
  bookmarked INTEGER NOT NULL DEFAULT 0 CHECK(bookmarked IN (0,1)),
  following INTEGER NOT NULL DEFAULT 0 CHECK(following IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(account_id, slug)
);
CREATE INDEX account_project_followers ON account_projects(slug, following);

CREATE TABLE correction_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  slug TEXT NOT NULL REFERENCES managed_tools(slug),
  message TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','resolved','rejected')),
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX corrections_pending ON correction_requests(state, created_at);

CREATE TABLE collections (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tool_slugs_json TEXT NOT NULL CHECK(json_valid(tool_slugs_json)),
  approved INTEGER NOT NULL DEFAULT 0 CHECK(approved IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE source_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('succeeded','failed','partial')),
  candidates INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '',
  observed_at TEXT NOT NULL
);
CREATE INDEX source_runs_latest ON source_runs(source, observed_at DESC);

CREATE TABLE release_runs (
  id TEXT PRIMARY KEY,
  revision TEXT NOT NULL,
  states_json TEXT NOT NULL CHECK(json_valid(states_json)),
  created_at TEXT NOT NULL
);
