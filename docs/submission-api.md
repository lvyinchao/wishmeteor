# Product submission API

`POST https://wishmeteor.net/api/submit` accepts multipart form data. Anonymous and
browser-session submissions still require `Origin: https://wishmeteor.net`.
API clients instead send `Authorization: Bearer <token>`; no Origin or session
cookie is needed. A supplied invalid token returns 401, even with a valid cookie.
Tokens are restricted to submission creation, listing the account's submissions,
and checking or revoking the current token. They grant no administration access.

Required fields: `name` (up to 80 characters), `url` (public HTTP/HTTPS homepage),
`email` (must match the token account), `own=yes`, and `screenshot` (actual PNG,
JPEG or WebP file, at most 5 MiB, with matching MIME type). `category` defaults to
`uncategorized`; `notes` is up to 600 characters; `makeAWish` is optional, up to 320.
The verified `lvyinchao@gmail.com` account auto-publishes with dofollow and is
exempt from ordinary submission and publication quotas. Its `notes` must be
300–600 characters of real product description. Other accounts enter review.

```sh
curl https://wishmeteor.net/api/submit \
  -H "Authorization: Bearer $WISHMETEOR_API_TOKEN" \
  -H 'Accept: application/json' \
  --form-string 'name=Your product' \
  --form-string 'url=https://your-product.com' \
  --form-string 'email=lvyinchao@gmail.com' \
  --form-string 'own=yes' \
  -F 'notes=<description.txt' \
  -F 'screenshot=@product.png;type=image/png'
```

Bearer submissions always return JSON. HTTP 201 returns
`{"ok":true,"status":"published","id":123,"slug":"your-product-ab12cd34"}`
for automatic publication, or `status:"queued"` for review. Public pages are
`https://wishmeteor.net/tool/{slug}`. Errors include 400 `description-required`,
`screenshot-required`, `screenshot-invalid` or `rejected`; 401 `invalid-api-token`;
403 `email-account-mismatch`; 409 `duplicate`; 413 `screenshot-too-large` or
`payload-too-large`; and 429 `throttled` for ordinary accounts.

Check the current credential/account and publication policy:
```sh
curl https://wishmeteor.net/api/token -H "Authorization: Bearer $WISHMETEOR_API_TOKEN"
curl https://wishmeteor.net/api/account/submissions -H "Authorization: Bearer $WISHMETEOR_API_TOKEN"
```

Revoke the current credential (subsequent calls return 401):
```sh
curl -X DELETE https://wishmeteor.net/api/token -H "Authorization: Bearer $WISHMETEOR_API_TOKEN"
```

## Operator issuance

After applying migration 1016 and deploying the matching Worker, an authorized
operator can issue a credential for an existing verified account:
```sh
node scripts/issue-submission-credential.mjs --remote \
  --email lvyinchao@gmail.com --name 'Submission API' \
  --output /absolute/private/location/wishmeteor-api-token
```

The output directory must exist. The script refuses to overwrite an existing
file and writes the token with mode 0600. Only its SHA-256 hash and metadata enter
D1; raw credentials must never be committed or logged. Issued credentials have
no fixed expiry. They can be revoked individually or by account password
recovery/identity change. If registration has an uncertain outcome, retain the
private file and check the reported credential ID before retrying. Do not mint a
replacement blindly. Lost credentials can be revoked by an authorized operator
setting `revoked_at` on that exact credential ID.
