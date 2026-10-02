# Production release preparation

Baseline `ee09ee1`; branch `codex/wishmeteor-full-optimization-20261002`. Implementation and validation use an isolated managed worktree. Production writes, pushes and real notifications require the user's production release authorization. None were performed during development.

## Reviewed effects

- Seven new migrations: 1005, 1008–1013. They add nonce replay defense, account recovery/outbox, catalog projections/indices/counters, publication slots, discovery/operations tables and cross-table identity/alias guards.
- The account security migration clears unverified passwords and all ambiguous legacy Google/password combinations; it revokes sessions for those combinations. Verified password-only accounts retain their credential. Read-only production inspection on 2026-10-02 found one account, zero pending passwords, zero ambiguous combinations and zero sessions requiring this revocation. Refresh these counts immediately before applying migration.
- The product backfill is based on actual D1, preserves original dates and content, derives canonical product identities and baseline card versions, and rejects stale or conflicting rows. Refreshed read-only inspection at **2026-10-02 00:53 UTC** found **123 products, 35 pending applications and zero product identity conflicts**. Plan hash: `06c5e0b9cba393f2c098395ee99cf23eb52c13a19fad8424014f59c2884baaac`. The owner-only plan is in ignored `data/cache/backfill-plan-production.json`; generate a fresh plan for release.
- The 35 pending entries (IDs 8–42) came from the separately authorized product research/submission task. They remain unpublished editorial candidates, with no maker account, contact address or invented wish. Migration/backfill preserves their notes and review status while deriving product identity fields; it does not approve them or create notification recipients. The optimization release authorization remains separate from that content submission authorization.
- Five legacy submitted products lack a complete blessing. Backfill preserves that fact. No invented blessing or automatic retroactive blessing email is generated. The admin metrics expose this backlog; reviewers can edit and confirm the missing blessings through the versioned content editor.
- Publication allowance is nine **maker submissions** per UTC day. Historical verdict dates seed the allowance. Legacy stars remain displayed; newly recorded browser encouragement determines popular ordering.
- The Worker gains a five-minute scheduled cleanup/outbox handler. Existing SMTP/provider acceptance and inbox arrival remain separate. Do not claim exactly-once external delivery; a crash after provider acceptance can result in a retry.

## Local verification before release

`pnpm ship` with `docs/release-manifest.json` runs checks, isolated tests, build and `wrangler deploy --dry-run`. It checks staging and source integrity and performs no commit, push, production migration, deploy or notifications by default.

The isolated runtime used all migrations, a copied catalog, fixture accounts/submissions, a local Ed25519 key and **no Email binding**. Local backfill was applied twice, with no second-run product updates. Browser third-party requests were blocked. See `verification.md` for behavioral and visual evidence.

## Authorized release sequence

1. Inspect branch changes and `docs/release-manifest.json`; preserve the original dirty checkout.
2. Refresh the read-only production backfill plan and security impact counts. Export a D1 recovery backup to an owner-only ignored location. Do not put contacts, tokens, snapshots or private review files in Git.
3. Configure the Ed25519 public key as `LINK_VERIFIER_PUBLIC_KEY`; keep the matching private key in the owner-only verifier file or `WISHMETEOR_VERIFIER_KEY`. Preserve existing Google/admin secrets. Optional challenges require an approved Turnstile widget and `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAMES`; production hostname allowlists must exclude localhost. This release creates no Turnstile resources automatically.
4. During the coordinated migration window, stop applying catalog/moderation writes. Apply migrations and reviewed backfill, then deploy the exact committed revision. The old Worker lacks the new project key fields and its writes will be rejected after migration 1012 until deployment completes. Existing read routes continue serving. Backfill uses guarded chunks and fails on concurrent changes.
5. Read back the exact release revision on `/`, `/api/content`, `/category/marketing-growth`, `/sitemap-tools.xml`, representative details and a versioned PNG card. Check redirects, rel, canonical, public state and all 123 legacy entries.
6. Exercise authorized production account recovery/Google association and one reviewed publication with a controlled address. Verify provider message ID and actual inbox/card content separately. Check GA4 Realtime/DebugView for one page view and the requested conversion events; no contact or wish text should appear in event parameters.
7. Record commit, push, migration, backfill, deploy, readback and notification outcomes separately. If any later stage fails, preserve the successful stage evidence and resume only the unfinished stage.

The explicit pipeline flags are `--commit --push --migrate --deploy --production-authorized --backfill-plan=...`; `--notify` additionally requests immediate dispatch after public readback. Scheduled dispatch also operates once the new Worker is deployed. `--production-authorized` records already granted authorization; it does not obtain approval by itself.

## Recovery

Keep the previous Worker version and D1 export identity with the release report. Schema additions are additive, but cleared legacy password credentials must not be restored automatically. Rolling the Worker back without the corresponding identity-field compatibility change would restore handlers that fail new insertion guards. Coordinate code/database recovery and retain the credential safety fix. Rebuild a stale backfill plan instead of forcing it over newer content.
