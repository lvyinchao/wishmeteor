-- Both review paths share the project identity. Prevent races across the two
-- independently indexed tables as well as within them. Approval changes verdict
-- to approved before inserting the publication in the same D1 transaction.
CREATE TRIGGER pending_product_not_published_insert BEFORE INSERT ON submissions
WHEN NEW.verdict='pending' AND NEW.dedupe_key!='' AND EXISTS(SELECT 1 FROM managed_tools WHERE dedupe_key=NEW.dedupe_key)
BEGIN SELECT RAISE(ABORT,'duplicate-product'); END;
CREATE TRIGGER pending_product_not_published_update BEFORE UPDATE OF dedupe_key,verdict ON submissions
WHEN NEW.verdict='pending' AND NEW.dedupe_key!='' AND EXISTS(SELECT 1 FROM managed_tools WHERE dedupe_key=NEW.dedupe_key)
BEGIN SELECT RAISE(ABORT,'duplicate-product'); END;
CREATE TRIGGER published_product_not_pending_insert BEFORE INSERT ON managed_tools
WHEN NEW.dedupe_key!='' AND EXISTS(SELECT 1 FROM submissions WHERE dedupe_key=NEW.dedupe_key AND verdict='pending')
BEGIN SELECT RAISE(ABORT,'duplicate-product'); END;
CREATE TRIGGER published_product_not_pending_update BEFORE UPDATE OF dedupe_key ON managed_tools
WHEN NEW.dedupe_key!='' AND EXISTS(SELECT 1 FROM submissions WHERE dedupe_key=NEW.dedupe_key AND verdict='pending')
BEGIN SELECT RAISE(ABORT,'duplicate-product'); END;
