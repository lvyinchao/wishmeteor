# WishMeteor

A directory and wishing sky for builders at [wishmeteor.net](https://wishmeteor.net). A reviewed maker submission receives an approved listing, a reviewed blessing and a versioned downloadable card. Official links earn dofollow only while the shared verification policy is satisfied.

## Architecture

D1 is the authoritative product catalog and workflow store. `worker/catalog.ts` supplies the directory, search, categories, detail pages, comparison, collections, recommendations, weekly changes, RSS, sitemaps and public API. Indexed queries return bounded pages and summaries. Content and star version counters invalidate the Worker cache; public responses carry ETags. Approved, nonarchived listings are public regardless of their outbound link status.

Astro builds account, moderation, submission, articles and informational pages. `src/lib/public-shell.ts` supplies the same head, navigation, footer and analytics configuration to Astro and dynamic Worker pages. `public/site.js` handles URL filters, request cancellation, browser stars, comparison, saved projects and follow controls. Preview WebP variants are generated in `dist/`. Cards are rendered from the exact D1 content version, with PNG rasterization in the Worker.

Files under `src/content/tools` are legacy drafts/archive material, not another live directory. Articles require `approved: true` independently of product approval. Ingest refreshes a read-only D1 snapshot before deduplication. Hosted repositories and app listings use project identities; reviewers can record aliases for the official site and its repository.

## Local commands

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Install pinned dependencies |
| `pnpm check` / `pnpm check:worker` | Astro and Worker type checks |
| `pnpm test` | Isolated SQLite tests; all migrations applied; email and Google mocked |
| `pnpm build` | Static assets, modern preview images and article/default social cards |
| `pnpm exec wrangler dev --local` | Local Worker with D1 and static assets |
| `pnpm ingest -- --dry` | D1 snapshot and source collection, no catalog publication |
| `pnpm moderate` | Read pending review queue through authenticated admin API |
| `pnpm approve -- --submission=ID --draft=PATH` | Preview a reviewed approval; set `blessingApproved: true` in the reviewed draft and add `--write` to publish |
| `pnpm verify-links` | Inspect outbound sites; add `--write` with a configured signer to store signed outcomes |
| `pnpm notify` | Inspect notification status; `--write` requests outbox dispatch |
| `pnpm ship` | Check, tests, build and deployment dry run only |

The authoritative approval/verification CLI options are shown in their scripts. Mutating admin CLI operations require `--write`. Admin tokens are read from `WISHMETEOR_ADMIN_TOKEN`, `ADMIN_API_TOKEN`, or the owner-only file `~/.config/wishmeteor/admin-token`. Use `--base=http://127.0.0.1:PORT` for isolated local review.

## Moderation and operations

Open `/admin`, enter the admin token once, and use the expiring HttpOnly session. Reviewers edit the product and full blessing, explicitly confirm the blessing, then approve. Approval atomically claims one of nine maker publication slots per UTC day and cannot overwrite an existing slug. Submitted, approved and published dates remain distinct. Product updates require the loaded `expectedVersion`; URL changes reset verification and retain the old product identity as an alias.

The workbench includes correction requests, curated collection editing, alias review, notification status/retry and metrics. Metrics separate registrations, verified accounts and recent account activity; also show publication usage, review latency, verification age, source outcomes and release stages.

Notifications are inserted in the same transaction as their event. A five-minute scheduled handler cleans expired state and dispatches queued events with leases, retry/backoff and eligibility checks. `accepted` and a provider message ID mean provider acceptance; they do not prove inbox delivery. A crash after acceptance but before the database acknowledgement can resend a message. Submitter addresses remain available for essential service follow-up; never erase addresses to pretend delivery succeeded.

## Accounts and stars

Email passwords remain pending until the owner verifies a single-use link. Google links to verified accounts only with an existing password or account session. Google third-party addresses require a separate email challenge. Recovery supports resend, password setup/reset and revoking all sessions. The security migration clears ambiguous legacy Google/password combinations and revokes their sessions; affected owners can use Google or a recovery email.

Stars use an opaque server-issued browser cookie, per-IP and per-identity limits and an idempotent product vote. They measure browser encouragement, not people. Legacy votes stay visible; new verified browser votes determine popular order. Following a product is explicit and reversible; it enables essential listing update emails. If an IP repeatedly requests new identities, an optional configured Turnstile challenge is required; normal encouragement does not load the widget. Configure `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` and an exact deployment-specific `TURNSTILE_HOSTNAMES` allowlist to enable it.

## Verification, secrets and analytics

`LINK_VERIFIER_PUBLIC_KEY` stores the base64 SPKI Ed25519 public key. The private key stays in an owner-only local file selected with `WISHMETEOR_VERIFIER_KEY` or `--key`. The signing client checks public DNS addresses, pins the actual connection, bounds redirects and accepts HTML success responses only. Signed outcomes bind the URL, slug, observed state and expiry; nonce replay is rejected atomically. Failed or expired checks render nofollow unless the published product has an explicit dofollow approval. Verified, signed-in `lvyinchao@gmail.com` submissions publish automatically with dofollow. Editors can change a public listing’s link setting through `POST /api/admin/content/{slug}/link-policy` with `linkPolicy` (`dofollow` or `verified`) and its current `expectedVersion`; this records a versioned decision without claiming a successful link check or sending a new product notification.

Existing bindings: D1 `DB`, static assets `ASSETS`, Email Service `EMAIL`. Keep `ADMIN_API_TOKEN`, `GOOGLE_CLIENT_ID` and verifier configuration in Worker secret storage. Google Console must authorize the site's actual origins. Sender eligibility and inbox delivery require production checks. Local checks use an isolated configuration without an Email binding.

Public GA4 defaults to `G-QV8KGLLDXR` and records product views, outbound clicks, submission start/success, stars and listing shares using product slugs only. Account/admin and password reset pages suppress analytics. Configure `GA_MEASUREMENT_ID` for Worker pages and `PUBLIC_GA_MEASUREMENT_ID` for Astro. Real GA delivery requires Realtime/DebugView evidence; a local `dataLayer` event alone is not that evidence.

## Release

Read [production-release.md](docs/production-release.md) before release. `docs/release-manifest.json` lists exactly the allowed paths and migrations. The pipeline checks staging and uses argument arrays, preserves unrelated files, and reports check, build, commit, push, migration, backfill, deployment, readback and notification states separately. Production actions require explicit authorization and a reviewed backfill plan. The default pipeline performs no commit, push, production database mutation or notification dispatch.

See [optimization-plan.md](docs/optimization-plan.md) and [verification.md](docs/verification.md) for scope and evidence.
