# WishMeteor private MCP

Endpoint: **https://wishmeteor.net/mcp**, stateless Streamable HTTP using the official MCP TypeScript SDK. Create a **personal** custom MCP server in ChatGPT Plugins; no public directory submission is necessary. Authentication: OAuth, automatic discovery, **dynamic client registration (DCR)**, public-client token authentication `none`. Default scopes: `account:read submissions:read submissions:write sitemap:read`.

## OAuth and access

- Discovery: `/.well-known/oauth-protected-resource` (also `/mcp` suffix) and `/.well-known/oauth-authorization-server`.
- Authorization code + mandatory S256 PKCE; resource is exactly `https://wishmeteor.net/mcp`; issuer is exactly `https://wishmeteor.net`. Authorization redirects include RFC 9207 `iss`.
- DCR accepts only exact registered ChatGPT HTTPS callbacks: `/connector_platform_oauth_redirect` or `/connector/oauth/{callback_id}`. It has no API-key input or client secret requirement. CIMD is not advertised: OpenAI's live stable CIMD document requires `private_key_jwt`, which this minimal DCR implementation does not claim to support.
- Sign in with the existing WishMeteor password/Google account; explicitly review and consent to scopes. The consent request has a 10-minute lifetime and an HttpOnly same-site cookie/CSRF binding. Existing login returns to consent.
- Random opaque authorization codes (2 minutes), access tokens (15 minutes) and rotating refresh tokens (30 days) are stored **only as SHA-256 hashes**. Every tool validates the grant's verified account, scopes, audience, issuer, expiry and revocation. Refresh reuse revokes the entire grant. Recovery or account identity changes revoke grants.
- Tokens appear only in OAuth protocol responses/headers, never tool parameters/results or application logs. No legacy Bearer API credential or admin credential is used by MCP; it directly shares account business services.
- Disconnect/revoke at `/oauth/connections`; `/oauth/revoke` supports RFC 7009 token revocation. A ChatGPT client uninstall does not necessarily call this endpoint. For guaranteed immediate denial, revoke the WishMeteor grant as well; refreshing/deleting an MCP transport does not itself revoke a durable OAuth grant.

## Tools

| Tool | Required scope | Side effect |
| --- | --- | --- |
| `get_account` | `account:read` | Read account, limits, categories and screenshot/content requirements |
| `check_duplicate` | `submissions:read` | Read published listings and this account's pending records; match normalized URL/name/aliases |
| `submit_listing` | `submissions:write` | Upload and submit; trusted accounts may immediately publish |
| `get_submission` | `submissions:read` | Reread actual saved record by ID **or idempotency key** |
| `check_sitemap` | `sitemap:read` | Read current public page and automatically generated sitemap |

Read tools have `readOnlyHint=true`; submit has `false`. Auth is enforced on the server even if client annotations are ignored. Initialization/tool discovery can run without authentication; all actual tools require OAuth. Invalid supplied credentials fail closed, even for discovery.

`submit_listing` requires name, official URL, category, original factual description (300–600 characters), 1–10 source links, listing identity (`owner` or `authorized_independent`), 16–128 character idempotency key and a real screenshot. Independent permission does **not** assert ownership of a third-party website/domain. Account authority alone decides immediate publication; tool arguments cannot grant it.

Screenshot input declares `_meta["openai/fileParams"]=["screenshot"]`. Its four properties are `download_url` and `file_id` (required), `mime_type` and `file_name` (optional). Download is HTTPS-only from provider-controlled `*.oaiusercontent.com` or `files.openai.com`, without custom ports, URL credentials, redirects or local paths. Downloads have a 15-second deadline and a 5 MiB actual byte limit. Response MIME and declared MIME must match the PNG/JPEG/WebP file features. Bytes reuse the existing R2/submission validation; extensions cannot authorize a format. Signed URLs are never returned or logged. If OpenAI introduces a different file host, fail closed and update the allowlist from a verified actual client result.

Submissions recheck duplicates after download; database identity constraints and name/alias triggers cover concurrent writes. Account + idempotency key is unique in D1. Retries with unchanged content/file ID return the saved record without redownloading an expired screenshot URL; changed content under the same key is rejected. Transaction failures clean orphan covers; a lost commit response preserves a cover already referenced by the database. After any timeout use `get_submission` with the key.

Public status, URL, description and screenshot existence come from saved rows/R2. Sitemap output uses the same automatic sitemap generator as the public site; catalog-version cache keys already invalidate after publication. Sitemap presence is **not Google indexing**. No administrator sitemap-update tool is exposed.

## Migration and release

Baseline: `642e70608350de10db322eee006c08f80613aae7`; previous Worker version: `21860814-bfb8-4eda-89aa-56ae7e0cf40f`. Migration 1017 only adds OAuth tables, submission columns/index and guards; no backfill or existing-content rewrite is needed. Existing schema defaults keep browser/Bearer submissions compatible. Migration 1016 exists in production despite its old migration-ledger entry remaining absent; do not blindly reapply all pending migrations. Apply 1017 once after inspecting schema and saving a private database export. Keep export files outside Git. Rolling back the Worker to the baseline remains compatible with the additive schema.

Verification: 81 local tests including 15 MCP/security scenarios and an official SDK Streamable HTTP client integration; Astro check, Worker type check, build and deployment dry run. Actual personal plugin installation, WishMeteor OAuth consent, dot tools, screenshot upload, real submission, reread, duplicate retry and revocation are a separate acceptance stage. Record results in a redacted receipt; server tests alone do not establish dot acceptance.

Current account acceptance checkpoint (2026-10-11): ChatGPT discovered the OAuth metadata and DCR settings, but both personal plugin creation attempts returned “当前环境不允许创建自定义应用。请检查工作空间权限或安全设置”. No OAuth grant or dot tool execution was completed. The real math-video.com homepage screenshot and listing payload are prepared locally, but the website has not been submitted. The filled ChatGPT form is retained for continuation when the account can create a custom app. This external account restriction does not establish a server failure or a completed acceptance run.

Official references: [Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt), [OAuth](https://developers.openai.com/plugins/build/auth), [File parameters](https://developers.openai.com/plugins/reference), [Custom MCP authentication](https://developers.openai.com/api/docs/guides/custom-mcp-server), [Cloudflare transport](https://developers.cloudflare.com/agents/model-context-protocol/protocol/transport/).
