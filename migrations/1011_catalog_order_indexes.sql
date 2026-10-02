-- Status is a range predicate. Partial indexes keep that predicate out of the
-- ordering prefix so public pagination can walk the index without a sort table.
CREATE INDEX public_recent_order ON managed_tools(published_at DESC,slug ASC) WHERE approved=1 AND status!='archived';
CREATE INDEX public_category_order ON managed_tools(category,published_at DESC,slug ASC) WHERE approved=1 AND status!='archived';
CREATE INDEX public_pricing_order ON managed_tools(pricing,published_at DESC,slug ASC) WHERE approved=1 AND status!='archived';
CREATE INDEX public_origin_order ON managed_tools(origin,published_at DESC,slug ASC) WHERE approved=1 AND status!='archived';
CREATE INDEX public_popular_order ON managed_tools(trusted_star_count DESC,published_at DESC,slug ASC) WHERE approved=1 AND status!='archived';
CREATE INDEX public_category_popular ON managed_tools(category,trusted_star_count DESC,published_at DESC,slug ASC) WHERE approved=1 AND status!='archived';
