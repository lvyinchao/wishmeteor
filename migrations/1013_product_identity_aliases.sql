CREATE TABLE product_identity_aliases (
 alias_key TEXT PRIMARY KEY,
 slug TEXT NOT NULL REFERENCES managed_tools(slug) ON DELETE CASCADE,
 source_url TEXT NOT NULL,
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX product_alias_slug ON product_identity_aliases(slug);
CREATE TRIGGER alias_not_pending BEFORE INSERT ON product_identity_aliases
WHEN EXISTS(SELECT 1 FROM submissions WHERE verdict='pending' AND dedupe_key=NEW.alias_key)
BEGIN SELECT RAISE(ABORT,'duplicate-product'); END;
CREATE TRIGGER alias_not_another_product BEFORE INSERT ON product_identity_aliases
WHEN EXISTS(SELECT 1 FROM managed_tools WHERE dedupe_key=NEW.alias_key AND slug!=NEW.slug)
BEGIN SELECT RAISE(ABORT,'duplicate-product'); END;
CREATE TRIGGER pending_alias_not_published_insert BEFORE INSERT ON submissions
WHEN NEW.verdict='pending' AND EXISTS(SELECT 1 FROM product_identity_aliases WHERE alias_key=NEW.dedupe_key)
BEGIN SELECT RAISE(ABORT,'duplicate-product'); END;
CREATE TRIGGER pending_alias_not_published_update BEFORE UPDATE OF dedupe_key,verdict ON submissions
WHEN NEW.verdict='pending' AND EXISTS(SELECT 1 FROM product_identity_aliases WHERE alias_key=NEW.dedupe_key)
BEGIN SELECT RAISE(ABORT,'duplicate-product'); END;
CREATE TRIGGER published_alias_not_another_insert BEFORE INSERT ON managed_tools
WHEN EXISTS(SELECT 1 FROM product_identity_aliases WHERE alias_key=NEW.dedupe_key AND slug!=NEW.slug)
BEGIN SELECT RAISE(ABORT,'duplicate-product'); END;
CREATE TRIGGER published_alias_not_another_update BEFORE UPDATE OF dedupe_key ON managed_tools
WHEN EXISTS(SELECT 1 FROM product_identity_aliases WHERE alias_key=NEW.dedupe_key AND slug!=NEW.slug)
BEGIN SELECT RAISE(ABORT,'duplicate-product'); END;
