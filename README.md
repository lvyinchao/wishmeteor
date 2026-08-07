# WishMeteor

AI-assisted blessings, cards, and an anonymous wish wall for `wishmeteor.net`.

## Run locally

```bash
pnpm install
pnpm dev
```

## Production setup

1. Create a D1 database, two KV namespaces (`CACHE`, `SESSION`), and an R2 bucket (`wishmeteor-media`). Replace the placeholder IDs in `wrangler.jsonc`.
2. Apply `migrations/0001_initial.sql` to D1.
3. Add `QWEN_API_KEY` and `TURNSTILE_SECRET` through Wrangler secrets; do not commit them. `QWEN_BASE_URL` and `QWEN_MODEL` are non-secret Worker variables and default to the Qwen-compatible endpoint and `qwen3.8-max`.
4. Bind `wishmeteor.net` to the deployed Worker and configure the production `APP_URL`.

Text generation calls Qwen through its OpenAI-compatible `/chat/completions` interface. Keep the moderation and idempotent credit boundaries in the API layer when enabling production AI spend.
