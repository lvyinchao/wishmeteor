# WishMeteor

An English-language index of AI tools, models and open-source projects at
[wishmeteor.net](https://wishmeteor.net). Founders submit a product link — a *wish* — and once it clears
review the entry goes live with a **dofollow** backlink plus a blessing written for that specific product,
emailed to the submitter and printed on the entry page.

Pages are prerendered; the Worker handles submissions, community stars, account endpoints, and
admin-managed tool entries stored in D1.

## How it works

```
scripts/ingest/*  →  data/inbox/*.jsonl        collect candidates (never touches content)
Qoder cron jobs   →  data/drafts/{tools,blessings,posts}   draft entries, blessings, articles
pnpm approve      →  src/content/tools/*.json  human gate, enforces the daily cap
pnpm ship         →  build → commit → deploy → blessing emails
```

Content is files in git, one JSON entry per tool (`src/content/tools/`) and one Markdown article per post
(`src/content/posts/`), plus `src/content/categories.json`. There is no database-backed rendering; D1 holds
only the submission queue.

### Which links are dofollow

`src/lib/links.mjs` derives it — there is no `dofollow` flag to set by hand:

> approved **and** `checksFailed === 0` **and** checked within `SITE.staleAfterDays` days **and** at least
> `SITE.minDescriptionChars` characters of description.

`scripts/verify-links.mjs` is the only thing that moves those fields. A site that refuses scripted checks
answers 403 and is reported as **blocked**: open it yourself, then `node scripts/verify-links.mjs -- --confirm=<slug>`.
Unverified entries are rendered `rel="nofollow ugc"` and stay out of the sitemap.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | local dev server |
| `pnpm check` | `astro check` (site) — `pnpm check:worker` for `worker/index.ts` |
| `pnpm build` | prerender every page into `dist/`, then generate every `og:image` |
| `pnpm ingest` | run all four collection sources into `data/inbox/` |
| `pnpm moderate` | list pending wishes from the production queue (`-- --local`, `-- --show=ID`, `-- --reject=ID`) |
| `pnpm approve` | publish a wish (`-- --submission=ID`) or a curated draft (`-- --draft=path`) |
| `pnpm verify-links` | re-check outbound links and grant/revoke dofollow |
| `pnpm notify` | send blessing emails for published-but-unnotified wishes |
| `pnpm ship` | check → build → commit → deploy → notify, with a lock so runs cannot overlap |

## Scheduled jobs (local Qoder cron)

Three durable, permanent jobs, all **draft-only** — none of them publishes or deploys:

1. every 6 hours — collect candidates and draft up to 5 index entries
2. 08:30 and 20:30 — review the submission queue and draft up to 3 blessings
3. Monday 05:00 — re-check links, confirm blocked ones, draft the week's article

They require Qoder to be running on this machine; a closed laptop simply produces no drafts.

## Secrets

Local only, never shipped to the Worker (see `.env.example`):

- `CF_API_TOKEN` (optional) — Cloudflare Email Service, Email Sending. `wishmeteor.net` is already
  onboarded (Compute → Email Service → Email Sending), and Cloudflare manages the bounce SPF/DKIM/DMARC
  records for the zone. Without an explicit token, `scripts/notify.mjs` uses the OAuth token wrangler
  already keeps locally, which `pnpm ship` refreshes moments before it sends. `EMAIL_FROM` defaults to
  `support@wishmeteor.net`. Sending happens **after** a successful deploy, because the email embeds the
  card image and entry URL served by this site.
- `GITHUB_TOKEN` — optional; unauthenticated GitHub search is capped at 10 requests/minute.
- `ADMIN_API_TOKEN` — required to use the admin content and submission endpoints. Send it only in
  `Authorization: Bearer <token>`; never put it in a URL or browser bundle.

### Admin API

The API-managed directory starts empty and is served at `/tools` and `/tool/{slug}`. Content
changes take effect immediately without rebuilding the static site.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/submissions` | List pending applications |
| `POST` | `/api/admin/submissions/{id}/approve` | Approve and publish the supplied tool entry |
| `POST` | `/api/admin/submissions/{id}/reject` | Reject a pending application |
| `GET` | `/api/admin/content` | List API-managed entries |
| `PUT` | `/api/admin/content/{slug}` | Create or update an entry |
| `GET` | `/api/content` | Public JSON feed for managed entries |

Content writes accept a JSON object with `name`, `url`, `category`, `summary` (40–160 characters),
`description` (300–12,000 characters), `tags` (1–12 strings), `pricing` (`free`, `freemium`,
`paid`, `open-source`), and `status` (`active`, `beta`, `stale`, `archived`). For example:

```http
PUT /api/admin/content/example-tool
Authorization: Bearer <token>
Content-Type: application/json

{"name":"Example Tool","url":"https://example.com","category":"assistants","summary":"A concise description between forty and one hundred sixty characters long for this example tool.","description":"A fuller description of at least 300 characters explaining what the product does, who it helps, and what makes it useful in a real workflow. Include accurate details such as its main capabilities, supported platforms, and relevant limitations. This text appears on the public listing page, so it should help visitors decide whether the product is worth exploring before they follow the official link.","tags":["assistant"],"pricing":"freemium","status":"active"}
```

Approval uses the same content fields plus a `slug` in the request body. It records the
application verdict and publishes the entry together, and keeps the existing daily launch cap of
9 submissions:

```json
{"slug":"example-tool","content":{"name":"Example Tool","url":"https://example.com","category":"assistants","summary":"A concise description between forty and one hundred sixty characters long for this example tool.","description":"A fuller description of at least 300 characters explaining what the product does, who it helps, and what makes it useful in a real workflow. Include accurate details such as its main capabilities, supported platforms, and relevant limitations. This text appears on the public listing page, so it should help visitors decide whether the product is worth exploring before they follow the official link.","tags":["assistant"],"pricing":"freemium","status":"active"}}
```

Apply the content migration before deploying this API:
`pnpm exec wrangler d1 migrations apply wishmeteor --remote`.

Production resources: one Worker (`wishmeteor`) with static assets and a D1 database for submissions,
community stars, accounts, email verification and sessions. Zone routes on `wishmeteor.net` and `www`.

## Accounts and analytics

- `/account` supports Google sign-in / One Tap and email + password registration and sign-in. New email
  accounts must verify a single-use link sent through the Cloudflare Email Service binding. Passwords
  are stored as salted PBKDF2-SHA-256 hashes; session tokens are opaque, HttpOnly cookies whose hashes
  are stored in D1.
- Add a Google OAuth **Web application** client in Google Cloud Console and authorize the JavaScript origins
  `https://wishmeteor.net` and `https://www.wishmeteor.net`. Set the client ID as a Worker secret with
  `pnpm exec wrangler secret put GOOGLE_CLIENT_ID`. The client ID is public, but keeping it in the Worker
  secret store lets the page read it from `/api/auth/config` without committing environment-specific values.
- Cloudflare Email Service must have `wishmeteor.net` onboarded. The Worker binding is restricted to send
  from `support@wishmeteor.net`. Cloudflare currently requires a paid Workers plan for outbound Email Service.
- Apply `migrations/1003_accounts.sql` to D1 before enabling account endpoints in production:
  `pnpm exec wrangler d1 migrations apply wishmeteor --remote`.
- GA4 uses `G-QV8KGLLDXR` by default. Set `PUBLIC_GA_MEASUREMENT_ID` in the build environment to override it,
  or set it to a blank value to disable analytics.
- For local Worker testing, copy `.dev.vars.example` to `.dev.vars`; copy `.env.example` to `.env` for
  the Astro build settings. The local Email binding does not deliver verification messages unless Wrangler
  is explicitly configured to use the remote Email Service.

## Layout

```
src/content/{tools,posts,categories.json}   the published index
src/content.config.ts                       post schema (Astro content collections)
src/lib/catalog.mjs                         tools loader + publish validation
src/lib/links.mjs                           canonicalisation, dofollow rule, daily quota
src/lib/{jsonld,sitemap,og,pagination}.ts   SEO plumbing
src/pages/                                  index, tools, category, tool, blog, submit, legal, sitemaps
integrations/blessing-cards.mjs             satori + resvg: generates every og:image at build
worker/index.ts                             POST /api/submit, honeypot, throttle, dedupe
scripts/                                    ingest, moderate, approve, verify-links, notify, ship
```
