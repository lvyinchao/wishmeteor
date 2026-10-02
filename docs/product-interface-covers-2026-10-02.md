# Reviewed products and interface covers — 2026-10-02

All 35 previously pending editorial products (submission IDs 8–42) were approved.
The public catalog contains 159 products, including the existing 124. The pending
queue is empty. Every product retains its individually reviewed description,
pricing label, release stage, signed homepage check and approved blessing.

## One batch publication allowance

The owner authorized this batch to exceed the normal nine approvals per UTC day.
`APPROVAL_BATCH` temporarily contained a key, the UTC date and IDs 16–42. Approval
required both the authenticated admin request and matching deployment allowance.
Migration 1014 keeps `publication_days.used` constrained to 0–9, records extra
publications in `exception_used`, and stores the affected submissions in
`publication_exceptions`. The observed counters were 9 normal and 27 exceptional;
the total of 36 includes the JRJI publication that preceded this batch.

The deployment containing the covers removes the temporary allowance binding.
Normal submission approvals retain the daily limit of nine. Previously approved
submissions cannot be approved again.

## Cover provenance

The 35 covers are original browser captures or existing interface images from
the product's official site or its published BetaList listing. No image generator
was used. Covers show interface controls and screens instead of logos or generic
artwork. The source is linked below the cover on each product page.

The source types are explicitly distinguished:

| Source type | Products |
| --- | ---: |
| Public operating interface captured in the browser | 14 |
| Officially supplied interface image | 8 |
| Interface image from the product's published listing | 3 |
| Interface demonstration captured on the official website | 10 |

An interface demonstration does not establish authenticated app access or a
successful generation. The existing beta/waitlist labels remain visible. Tartelo
uses its published interface image; its current official site says launching soon.

`src/data/product-cover-sources.json` records the source URL, capture time and JPEG
SHA-256 for each product. Assets have both JPEG and WebP forms. Source screenshots
and selection records are retained locally outside Git. Display rules preserve
the original colors and complete interface without the previous brightness filter
or magnification crop. These rules are scoped to this recorded cover set.

## Delivery checks

Astro and worker type checks and the production build passed. Before adding the
covers, production readback verified all 35 pages, approved blessings, versioned
SVG/PNG cards and sitemap entries; the 124 earlier products were preserved and no
new third-party notification was queued. Cover delivery is additionally checked
against deployed bytes, product-page source captions and browser rendering.
