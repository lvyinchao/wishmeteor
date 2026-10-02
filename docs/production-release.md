# Production release and recovery record

Baseline `ee09ee1`; branch `codex/wishmeteor-full-optimization-20261002`. Implementation and local validation used an isolated managed worktree; the original dirty checkout was preserved. The production release was authorized and completed. Current deployed revision: `954691f64fc7f6d7a845c4f4c678a32db3031ce3`; Cloudflare version: `15ee3dfb-ff4a-469e-9a99-e5deaef8b013`.

## Reviewed effects

- Production migrations 1005 and 1008–1014 were applied. They add nonce replay defense, account recovery/outbox, catalog projections/indices/counters, publication slots, discovery/operations tables, cross-table identity/alias guards, and a bounded, audited allowance for the specifically reviewed 35-product batch.
- The account security migration cleared unverified passwords and ambiguous legacy Google/password combinations, revoking affected sessions. Verified password-only accounts retained their credential. The pre-migration read-only inspection found one account, zero pending passwords, zero ambiguous combinations and zero sessions needing revocation.
- The product backfill used actual D1, preserved original dates and content, derived canonical product identities and baseline card versions, and rejected stale or conflicting rows. The plan was refreshed immediately before migration; at that point it found 123 products, 35 pending applications and zero product identity conflicts. The private plan remains in ignored `data/cache/backfill-plan-production.json` and must be regenerated before any future backfill.
- The 35 researched entries (IDs 8–42) were submitted without maker accounts, contact addresses or invented wishes, then published after separate explicit approval. Production now has 159 public products and zero pending submissions. A one-day audited exception accounted for 27 entries; the ordinary nine-per-day maker allowance was preserved. The temporary exception was removed after the batch.
- Five legacy submitted products lack a complete blessing. Backfill preserves that fact. No invented blessing or automatic retroactive blessing email is generated. The admin metrics expose this backlog; reviewers can edit and confirm the missing blessings through the versioned content editor.
- Publication allowance is nine **maker submissions** per UTC day. Historical verdict dates seed the allowance. Legacy stars remain displayed; newly recorded browser encouragement determines popular ordering.
- The deployed Worker runs its cleanup/outbox handler every five minutes. Provider acceptance and inbox arrival remain separate. Delivery is at-least-once: a crash after provider acceptance can result in a retry.

## Local verification before release

`pnpm ship` with `docs/release-manifest.json` runs checks, isolated tests, build and `wrangler deploy --dry-run`. It checks staging and source integrity and performs no commit, push, production migration, deploy or notifications by default.

The isolated runtime used all migrations, a copied catalog, fixture accounts/submissions, a local Ed25519 key and **no Email binding**. Local backfill was applied twice, with no second-run product updates. Browser third-party requests were blocked. See `verification.md` for behavioral and visual evidence.

## Release procedure used

1. Inspect branch changes and `docs/release-manifest.json`; preserve the original dirty checkout.
2. The read-only production backfill plan and security impact counts were refreshed before migration; a D1 recovery export was kept in an owner-only ignored location. Contacts, tokens, snapshots and private review files were excluded from Git.
3. Configure the Ed25519 public key as `LINK_VERIFIER_PUBLIC_KEY`; keep the matching private key in the owner-only verifier file or `WISHMETEOR_VERIFIER_KEY`. Preserve existing Google/admin secrets. Optional challenges require an approved Turnstile widget and `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAMES`; production hostname allowlists must exclude localhost. This release creates no Turnstile resources automatically.
4. During the coordinated migration window, catalog/moderation writes were stopped. Migrations and guarded backfill completed before the exact committed revision was deployed. Migration 1012 intentionally required project identity fields, so old catalog writers were incompatible during the window; normal writes resumed after deployment.
5. Read back the exact release revision on `/`, `/api/content`, `/category/marketing-growth`, `/sitemap-tools.xml`, representative details and a versioned PNG card. Check redirects, rel, canonical, public state and all 123 legacy entries.
6. Authorized production account recovery, Google sign-in/association, provider acceptance, inbox/card delivery and reviewed publication were exercised. GA4 Realtime did not receive the initial controlled checks. The missing collection request was traced to the site's gtag queue wrapper; a source fix is prepared in this follow-up release. Recheck the live page-view and conversion-event requests and Realtime after deployment. No contact or wish text should appear in event parameters.
7. Record commit, push, migration, backfill, deploy, readback and notification outcomes separately. If any later stage fails, preserve the successful stage evidence and resume only the unfinished stage.

The original authorized release used scoped commits, `git push origin HEAD:main`, the reviewed migrations/backfill plan, and `wrangler deploy --var RELEASE_REVISION:<commit>`. The local pipeline supports `--commit --push --migrate --deploy --production-authorized --backfill-plan=...`; `--notify` additionally requests immediate dispatch after public readback. Scheduled dispatch operates once the Worker is deployed. `--production-authorized` records prior authorization; it does not obtain approval by itself.

## Recovery

Keep the previous Worker version and D1 export identity with the release report. Schema additions are additive, but cleared legacy password credentials must not be restored automatically. Rolling the Worker back without the corresponding identity-field compatibility change would restore handlers that fail new insertion guards. Coordinate code/database recovery and retain the credential safety fix. Rebuild a stale backfill plan instead of forcing it over newer content.
