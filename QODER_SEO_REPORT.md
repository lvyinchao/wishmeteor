# SEO report: Product Hunt alternative for AI tools

## Files changed

- `src/pages/product-hunt-alternative-ai-tools.astro`: new static guide with FAQPage and WebPage structured data.
- `src/pages/indie-ai-tools-directory.astro`: contextual link to the new guide.
- `src/lib/sitemap.mjs`: added the new slashless static path.
- `tests/product-hunt-alternative-ai-tools.test.mjs`: coverage for metadata, schemas, links, robots, sitemap, missing `llms.txt`, and static asset configuration.
- `tests/sitemap.test.mjs`: coverage of the new path in the worker-generated sitemap alongside existing catalog pagination.
- `QODER_SEO_REPORT.md`: this report.

## Page metadata

- Title: `Product Hunt Alternative for AI Tools | WishMeteor`
- H1: `A Product Hunt alternative for AI tools`
- Meta description: `Looking for a Product Hunt alternative for AI tools? Explore WishMeteor, a free directory for independent products beyond a single launch day.`
- Canonical: `https://wishmeteor.net/product-hunt-alternative-ai-tools`
- The page is indexable, uses the same Open Graph and canonical rendering as sibling pages, and emits FAQPage and WebPage JSON-LD.

## Discovery and links

The prerendered page sitemap and the worker both use `SITEMAP_PAGES`; the worker also adds catalog and category pagination at request time. The test suite checks the new slashless URL and preserves coverage for those dynamic pages. With the same `drop-trailing-slash` setting, a local Wrangler asset-only server returned `307` to the slashless route, which returned `200` with the expected canonical; its `/llms.txt` returned `404`. The live `/about/` likewise redirects to `/about`; the new route's production redirect cannot be tested until deployment.

The guide links to `/submit-ai-tool`, `/indie-ai-tools-directory`, `/new-ai-tools`, `/new`, `/about`, `/blog/launch-weekly`, and `/dofollow-policy`. The indie directory links back to the guide. No `llms.txt` was created; the live endpoint returned 404.

## Verification

- `pnpm test`: passed, 100 tests.
- `pnpm build`: passed, including the new static page and sitemap entry.
- Verified the relevant WishMeteor claims against the live about, submission, directory and new-tools pages and their worktree sources. The latest checked-in Launch Weekly issue covers November 16–22, 2026.
- The user-provided search-intent research and the general description of Product Hunt were not independently rechecked. The page makes no competitor pricing, traffic, ranking or review-time claims and does not promise approval, traffic or permanent retention.
- The worktree initially contained the untracked `wishmeteor-seo-20261123-qoder-prompt.md`; it was preserved and excluded from the commit.
