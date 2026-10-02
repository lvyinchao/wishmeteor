# Verification evidence — 2026-10-02

Local implementation checks used isolated SQLite/D1 or a local Wrangler Worker with **no Email binding**; third-party browser traffic was blocked during those checks. Production release actions and separately authorized product operations are recorded below. A later controlled production analytics check did send public product-view and share events, but GA4 did not show them in Realtime.

## Automated and runtime checks

- 41 SQLite/Worker tests cover account pre-registration and races, verified association, third-party email challenge, single-use verification/reset, legacy credential migration, public status, pagination, atomic nine-per-day publication, slug/URL/blessing guards, optimistic editing, signed verification replay/downgrade, versioned cards, opaque stars, submission/outbox transactions, saved/followed projects, corrections, withdrawal, notification lease/retry/cancellation, admin cookie origin/rotation, identity aliases, guarded backfill, release manifest/locks/argument arrays, D1 failures, DNS/redirect safety, source identities, GitHub parser changes, optional Turnstile hostname/action verification and current approval mail/card version.
- Astro check: zero errors, warnings or hints. Worker type check, build and deployment dry run pass. CI runs the same isolated checks without deployment credentials.
- 6,000-product fixture: bounded page **7,627 bytes**, indexed `public_recent_order`, approximately 6–17 ms in local SQLite across runs. This is a local fixture result, not a production latency/LCP claim.
- All migrations applied with real Wrangler/Miniflare D1. A local 123-product catalog plus fixture owner/review queue was backfilled twice; the second run made no product updates. Guarded SQL also rejects concurrent/stale content.
- Real local HTTP `/sitemap-tools.xml` returned 123 product URLs before fixture publication, including products with nofollow outbound links. The previously missing marketing category returned 200. Public JSON returns bounded summaries; detailed descriptions/sources are omitted.
- The CLI performed a real public DNS/HTTPS HTML check for Foleyix, signed a live 200 outcome using an isolated Ed25519 key, and stored it in **local D1**. No production verification state was changed.

## Browser and artifact checks

Playwright ran against the local Worker at 375, 768 and 1440 CSS pixels. Homepage, tools, detail, account, submission, comparison, collection, updates and admin showed no horizontal overflow or JavaScript page errors. Keyboard account tabs and reduced-motion preference were exercised.

The browser completed combined filtering/back navigation, persistent browser stars, comparison selection, link copying, owner login, pending submission editing, bookmark/follow, correction submission/resolution, admin approval with an edited and confirmed blessing, collection creation, profile publication link, PNG download, session revocation and email reset/new-password login. It also submitted the actual wish form and observed the local submission-success event.

The downloaded PNG was viewed directly: its full blessing matched the reviewed listing version. A boundary PNG with an 80-character title and 600-character blessing was also rendered and visually inspected for clipping/overlap. Fonts are bundled with their license; preview images have intrinsic dimensions and generated WebP versions/fallbacks.

Screenshots and PNG evidence are attached in the task's visual artifact directory:

- `optimization-desktop.png`
- `optimization-mobile.png`
- `optimization-reviewed-blessing.png`
- `optimization-card-boundary.png`

GA event assertions confirmed local `product_view`, `share_listing` and `submission_success`; star events are exercised in the shared interaction flow. Account/reset/admin load no GA tag; reset tokens are removed from the URL before other scripts. Local assertions do not prove GA4 receipt.

## Source collection

Read-only collection ran against the copied D1 snapshot. Hacker News, Hugging Face and vendor sources completed. GitHub initially reported a changed markup parser as a partial failure rather than success with zero results. After fixing attributes before the repository href, the live Trending page parsed 15 repositories and the GitHub dry run completed with 51 candidates and zero source failures. Candidates retain canonical URL, root domain, hosted project identity, source and observation timestamps; news entries retain their published date when available.

## Production readback

- The deployed root and public API now report revision `063e69abda8bed337f98cc9c7e6a90dce78664d3` (Cloudflare version `e433ae9e-cc59-4989-a76d-dc0490c882cd`). Read-only admin metrics on 2026-10-02 returned 159 public products, zero pending submissions, 36 published that day, five incomplete legacy blessings, and six accepted outbox records. The migration, guarded backfill, push and deployment have been completed; release records are available from the admin metrics endpoint.
- Production Google sign-in, account recovery, provider acceptance, inbox delivery, and a controlled publication were recorded as passed in the release log. The 35 researched entries are published; no contact address or maker ownership was invented for them. The nine-per-day maker allowance remained in place; a separately authorized, audited exception covered 27 of the 35-item batch.
- The correct GA4 stream is visible in the current Google account as `wishmetetor`; its website URL is `https://www.wishmeteor.net` and its measurement ID matches the deployed `G-QV8KGLLDXR` tag. Browser network capture showed the old gtag wrapper queued calls as arrays but emitted no collection requests. After matching Google's standard `arguments` queue and deploying `063e69a`, the live page emitted `page_view` and `product_view` requests with HTTP 204; a copy-link action emitted `share_listing` with HTTP 204. GA4 Realtime then showed one active user and all three events. No search terms, account details, contact addresses or wish text were included in those events. The Internal Traffic filter remains in Testing state.
- Turnstile is optional and unconfigured; server/client integration and rejection cases were tested with isolated responses, but no real widget was created. Five legacy submitted listings still lack complete blessings; the migration preserved them for review and did not invent text or send retroactive mail.
