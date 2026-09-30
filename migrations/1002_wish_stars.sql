-- One community star per anonymous browser and wish.
CREATE TABLE IF NOT EXISTS wish_stars (
  slug TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (slug, voter_hash)
);

CREATE INDEX IF NOT EXISTS wish_stars_slug_idx ON wish_stars (slug);
