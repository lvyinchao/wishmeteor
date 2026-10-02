# Full optimization acceptance plan

Source: the 2026-10-02 code review and the user's instruction to implement all recommendations. Baseline: `ee09ee1`. Existing local drafts and private review material remain in the original checkout.

## Requirements and evidence

- [x] Account association: unverified pre-registration password cannot authenticate after Google login; registration/link races fail closed; verified accounts require an existing credential to associate Google; third-party Google email ownership requires a separate challenge.
- [x] Account recovery: resend without changing passwords; single-use reset; password setup for Google accounts; session revocation; per-IP and per-identity throttles; expired-state cleanup.
- [x] Single product source: D1 repository serves public pages, API, categories, sitemap, moderation, CLI, link verification, notifications and import dedupe. File products are drafts/archive, not a second live directory. Article publication has its own approval flag.
- [x] Public states: archived/unapproved entries excluded everywhere, including detail, comparison, recommendation, sitemap and stars; admin retains records.
- [x] Publication: separate submitted/approved/published dates; atomic nine-per-day UTC allowance; concurrent and old submissions obey cap; slug conflict cannot overwrite existing product; approval matches submitted URL.
- [x] Shared rendering: one public head/navigation/footer/analytics across Astro and Worker; canonical, OG and appropriate JSON-LD; current design preserved at desktop and mobile widths.
- [x] Link verification: authenticated signed proof, URL/slug binding, expiry and atomic replay defense; DNS/address/redirect guards; D1 updates; expired/failed checks downgrade links; public and email copy reflects actual status.
- [x] Wish delivery: review workbench edits and confirms blessing; published detail and downloadable card share the same version; profile has progress, pending edit and correction requests.
- [x] Notification delivery: transactional outbox, event idempotency, leases, retry/backoff, status/message ID/error observability, manual retry; no submission email deletion; local delivery simulated. Provider acceptance and actual inbox delivery are distinct evidence.
- [x] Anonymous stars: server-issued browser identity, throttles, per-product idempotency, accurate wording; fresh client UUID cannot bypass identity; ranking uses recorded counts and treats votes as browser encouragement.
- [x] Catalog performance: indexed slug/filter queries, bounded summaries/pagination, versioned public cache and ETags, content invalidation, bounded star queries; explain plans and isolated large fixtures.
- [x] Frontend efficiency: debounce/abort/cache, filters and pagination in URL, dimensions/fallback/modern image variants, reduced motion and keyboard/focus support.
- [x] Runtime validation: shared field/date/URL/category/source/blessing schema, bounded bodies before parsing, typed 400/413 responses; static and dynamic policy parity.
- [x] Pipeline: explicit release manifest and argument-array commands; no private/unrelated staging; separate check/commit/push/deploy/readback/notify states; lock recovery; build artifacts do not dirty source.
- [x] Ingest: D1 snapshot/API-backed dedupe, URL/root-domain/project IDs, traceable source and observation time, diagnostics and source job outcomes.
- [x] Operations: review latency, registrations vs active accounts, notification failures, verification age, source health, release/version visibility; updated README, CI and regression coverage.
- [x] Discovery/retention: combined search/category/pricing/sort filters, shareable URLs, bookmarks/follows, trustworthy popular order, product comparison, thematic collections and weekly on-site change log/RSS with source dates.

## Delivery scope

Implement and verify all requirements in an isolated worktree. No production writes or real mail during development. Present the concrete migration and release result before requesting any new production authorization required by the user's AGENTS instructions. Conditional monetization research in the review is not a request to launch paid placements or marketing email.

## Progress

- Created isolated managed worktree on `codex/wishmeteor-full-optimization-20261002` from current main.
- Reviewed the current source, original drafts, Cloudflare D1 transactions, static asset routing and email/scheduled APIs.

## Acceptance evidence

Implementation and isolated behavior checks are complete; see `verification.md` for evidence. The checked requirements refer to implemented/local verified behavior. Production GA receipt, real Google login, delivery/inbox and release readback retain the explicit gates in `production-release.md`.
