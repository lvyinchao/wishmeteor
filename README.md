# WishMeteor

An English-language index of AI tools, models and open-source projects at
[wishmeteor.net](https://wishmeteor.net). Founders submit a product link — a *wish* — and once it clears
review the entry goes live with a **dofollow** backlink plus a blessing written for that specific product,
emailed to the submitter and printed on the entry page.

Everything is prerendered. The only dynamic code is the submission endpoint.

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

- `RESEND_API_KEY`, `RESEND_FROM` — blessing email delivery. Sending happens **after** a successful deploy,
  because the email embeds the card image and entry URL served by this site.
- `GITHUB_TOKEN` — optional; unauthenticated GitHub search is capped at 10 requests/minute.

Production resources: one Worker (`wishmeteor`) with static assets, one D1 database with a single
`submissions` table. Zone routes on `wishmeteor.net` and `www`.

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
