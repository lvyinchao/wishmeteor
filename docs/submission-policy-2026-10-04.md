# Submission screenshots and trusted publication

Every new POST /api/submit requires a multipart `screenshot` file: PNG, JPEG or WebP, at most 5 MiB. Server checks byte signatures, declared type, file size and bounded request size. Arbitrary cover URLs are not accepted. Existing submissions are grandfathered and retain their current moderation workflow.

Files live in the private R2 bucket `wishmeteor-product-screenshots` bound as `PRODUCT_SCREENSHOTS`. Migration 1015 adds a nullable unique screenshot key to submissions. Pending/rejected files are available only to the verified submitting account and authorized reviewers. Approved, visible products expose their own screenshot as the cover. Archived/unapproved listings lose public image access. Withdrawal deletes a pending upload. Database failures clean unattached uploads; an uncertain commit cannot delete a cover already associated with a submission.

Only a signed-in account with a verified email exactly equal to `lvyinchao@gmail.com` receives automatic approval. Form contact email, client flags and unverified registrations never confer permission. This account bypasses product submission IP/email throttles and daily publication caps. Ordinary capacity remains nine publications per UTC day; trusted publications increment the separate audited exception counter. Authentication protections, origin checks, duplicate identity guards, ownership declaration and screenshot validation apply to everyone.

Automatic listings use the maker’s 300–600 character description directly, derive the short summary from that text, retain the maker wish, and use unknown pricing and an unverified link state. The standard blessing, public record, versioned card, event, approval notification and exception audit are saved in one D1 transaction. Product screenshot URLs do not receive fabricated WebP alternates.

The form shows the signed-in account’s publication policy, screenshot preview and direct listing link after automatic publication. Account and moderation views display retained screenshots. Link and privacy policies describe these rules without publishing the privileged account’s email.

## Validation

- 50 automated tests, Worker TypeScript and Astro checks passed.
- Isolated workerd/D1/R2: real JPEG pending upload and authorized preview matched source bytes; anonymous access returned 404.
- Isolated workerd/D1/R2: verified owner publication with a real WebP returned published; anonymous product page and original cover returned 200 with matching bytes.
- Browser: missing screenshot prevented submission, file preview decoded, multipart upload redirected to queued, automatic listing cover decoded.
- Tests exercise twelve trusted publications with the ordinary daily cap already exhausted, spoofed contact email, invalid/oversized files, ordinary throttling, legacy approvals, duplicate races, rollback and lost commit response.

## Rollout

Create the R2 bucket, apply the additive 1015 migration, then deploy the Worker and built assets with existing variables and secrets preserved. Rollback can use the previous Worker version while retaining the additive column and bucket. Production checks verify the deployed revision, form requirements, account policy and validation responses without publishing synthetic directory entries.
