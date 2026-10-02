-- New publications and pending submissions must carry a canonical project key.
-- Legacy rows are backfilled by the reviewed release plan before normal writes.
CREATE TRIGGER managed_identity_required_insert BEFORE INSERT ON managed_tools
WHEN NEW.dedupe_key='' OR NEW.root_domain=''
BEGIN SELECT RAISE(ABORT,'product-identity-required'); END;
CREATE TRIGGER submission_identity_required_insert BEFORE INSERT ON submissions
WHEN NEW.verdict='pending' AND (NEW.dedupe_key IS NULL OR NEW.dedupe_key='')
BEGIN SELECT RAISE(ABORT,'product-identity-required'); END;
