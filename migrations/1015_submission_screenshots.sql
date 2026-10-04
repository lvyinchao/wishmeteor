-- Existing submissions remain reviewable; all new submissions require a screenshot.
ALTER TABLE submissions ADD COLUMN screenshot_key TEXT;
CREATE UNIQUE INDEX submissions_screenshot_key ON submissions(screenshot_key) WHERE screenshot_key IS NOT NULL;
