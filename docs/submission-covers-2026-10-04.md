# Covers for the five October 2 approvals

Added covers for PayBox, SnapGen AI, EzMaker AI, Tarang, and LearnVector to
`public/tool-previews/`. Each JPEG is a browser capture of its official website;
the production build also creates the WebP used by modern browsers.

SnapGen and EzMaker show their public operating interfaces without submitting a
generation or uploading data. PayBox and Tarang show the official website's
interface demonstrations. Tarang's authenticated studio was not accessed.
LearnVector shows its website and waitlist because the application is still being
built. Its caption explicitly says "Official website preview".

`src/data/product-cover-sources.json` records the source page, capture time,
description, and JPEG SHA-256. Existing interface-cover display rules preserve
the full image and original colors on both list and detail pages.

The release starts from production revision
`52f88b58e704e27fc10b462737667a75c44852b9` in an isolated checkout. It changes only
these covers, their provenance, and the website-preview label. Approval records,
blessings, and product descriptions are preserved.
