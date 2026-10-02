-- Keep the normal 0..9 counter intact and account for explicitly authorized batches.
ALTER TABLE publication_days ADD COLUMN exception_used INTEGER NOT NULL DEFAULT 0 CHECK(exception_used>=0);
CREATE TABLE publication_exceptions (
  submission_id INTEGER PRIMARY KEY REFERENCES submissions(id),
  batch_key TEXT NOT NULL,
  day TEXT NOT NULL,
  publication_operation TEXT NOT NULL,
  created_at TEXT NOT NULL
);
