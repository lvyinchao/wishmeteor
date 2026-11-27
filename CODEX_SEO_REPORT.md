# There's An AI For That alternative guide — November 27, 2026

PR: https://github.com/lvyinchao/wishmeteor/pull/13 (against `main`; not merged or deployed).

- `src/pages/theres-an-ai-for-that-alternative-ai-tools.astro`: dated TAAFT comparison, task-based browsing example, submission advice, WebPage and FAQPage data.
- `src/pages/indie-ai-tools-directory.astro` and `src/lib/sitemap.mjs`: one reciprocal link and the slashless static sitemap entry.
- `tests/theres-an-ai-for-that-alternative-ai-tools.test.mjs` and `tests/sitemap.test.mjs`: rendered SEO, FAQ parity, official and internal links, hub discovery, robots and sitemap coverage.
- `CODEX_SEO_REPORT.md`: delivery record. `pnpm test` passed 106/106; `pnpm build` produced 31 pages. Local Miniflare served the built guide at `/theres-an-ai-for-that-alternative-ai-tools` with HTTP 200 and redirected the trailing-slash URL there with HTTP 307.
- Verification limits: TAAFT's homepage, launch and submit URLs returned HTTP 403 to direct re-fetches, so the guide uses the supplied November 27 observations. The live WishMeteor FullCastBook listing returned 200; live `/llms.txt` returned 404 and no file was added. The referenced `../.tessl/RULES.md` was absent. No delivery blocker; the new route has not been verified in production.

# Previous report: Futurepedia alternative guide

## Page metadata

| Field | Rendered value |
| --- | --- |
| Title | Futurepedia Alternative for AI Tools \| WishMeteor |
| H1 | A Futurepedia alternative for AI tools |
| Description | Looking for a Futurepedia alternative? Browse independent AI products on WishMeteor, see how listings are reviewed, or submit your own tool for free. |
| Canonical | `https://wishmeteor.net/futurepedia-alternative-ai-tools` |

## Files and discovery

- `src/pages/futurepedia-alternative-ai-tools.astro` adds the guide. Readers can browse `/new`, explore `/indie-ai-tools-directory` and `/category/audio-voice`, or start a listing at `/submit-ai-tool`. The score-to-MIDI example links to `/blog/launch-weekly` and its November 16–22 issue at `/blog/launch-weekly-2026-11-22`. The guide points to `/about` for editorial policy and `/product-hunt-alternative-ai-tools` for launch-day questions.
- `src/pages/indie-ai-tools-directory.astro` links back from its browsing section.
- `src/lib/sitemap.mjs` includes the slashless path in `SITEMAP_PAGES`. The static sitemap uses this list. In production the Worker handles `/sitemap-pages.xml` and adds directory and category pagination at request time.
- `tests/futurepedia-alternative-ai-tools.test.mjs` checks rendered metadata, indexability, WebPage and visible FAQPage parity, links, robots and the static sitemap. `tests/sitemap.test.mjs` checks the new URL alongside paginated Worker results.
- `CODEX_SEO_REPORT.md` records the changes and checks.

## Verification

- `pnpm test` passed all 103 tests. `pnpm build` produced 30 static pages, including the guide.
- A local Wrangler asset server served the production build using the repository’s HTML handling. The trailing-slash request returned 307 to the slashless URL, which returned 200 and declared the expected canonical. The built pages sitemap contained that URL once. Both local and live `/llms.txt` returned 404. The new guide’s production response remains unverified pending deployment.
- On November 26, 2026 (Asia/Shanghai), Futurepedia’s homepage featured a Personal AI Plan, its categories returned 200, and GET requests to `/submit-tool` and `/submit` returned 404. [Futurepedia homepage](https://www.futurepedia.io/) · [AI tool categories](https://www.futurepedia.io/ai-tools)
- Checked the editorial and submission claims against WishMeteor’s public pages and this checkout. The latest checked-in Launch Weekly issue covers November 16–22. [About](https://wishmeteor.net/about) · [Submission guide](https://wishmeteor.net/submit-ai-tool) · [November 16–22 issue](https://wishmeteor.net/blog/launch-weekly-2026-11-22)
- Google Suggest returned both “futurepedia alternative” and “futurepedia io alternative.” The supplied Search Console and Reddit observations were not independently rechecked. [Google Suggest response](https://suggestqueries.google.com/complete/search?client=firefox&q=futurepedia%20alternative)
