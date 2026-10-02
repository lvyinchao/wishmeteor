# Navigation, News, Blog and Wish Sky filters

## Scope

- Keep one project-navigation item, **Wish Sky**, pointing to `/new`. Remove the duplicate Explore ideas item from the header and Explore projects from the footer. Existing `/tools` URLs continue to work and highlight Wish Sky.
- Remove Collections links, its public rendering and its administration panel. Old `/collections` URLs redirect permanently to `/new`; existing database records are retained.
- Add **News** at `/news`, with three concise summaries linked to the original publisher, the original publication date and an explicit selection review date. These are an editorial snapshot, not an automatically refreshing news feed.
- Surface **Blog** at `/blog` and publish two original articles about reading project listings and the role of wishes and editorial blessings. Previous unapproved drafts stay unpublished. Article references point to existing published projects.
- Include News in the page sitemap, remove Collections, and include the two new articles in the post sitemap. Generate their social preview images using the existing build integration; the frontmatter helper returns approval as a string.

## Filter layout

The old desktop grid placed search in one column and all other controls in the remaining column. Replace this with a full-width search row and a separate filter grid. Desktop has four equally sized selects and an aligned Apply button. Tablet and phone have two columns and a separate Apply row; very narrow screens use one column. Controls remain at least 44px tall, with explicit keyboard focus styles and the existing URL-based filtering behavior.

## Content sources reviewed on 2026-10-02

- Ai2, Olmo-core 3, published October 1: <https://huggingface.co/blog/allenai/olmocore3>
- Open TTS Leaderboard authors, published September 30: <https://huggingface.co/blog/open-tts-leaderboard>
- Google Cloud, Gemini 3.8 Live with Live Avatar, published September 25 on the article page: <https://cloud.google.com/blog/products/ai-machine-learning/gemini-3-8-live-with-live-avatar-is-now-generally-available/>

The summaries preserve relevant distinctions: speech metrics complement human listening, custom avatars require allowlisting, and Extended Thinking remains in private preview.

## Checks

- Astro check: 85 files, zero errors, warnings or hints.
- Worker TypeScript check and changed JavaScript syntax checks pass.
- Build: 15 pages and three social cards, including both Blog articles.
- Real browser against the isolated local Worker: 1440, 768, 390 and 320px widths; no horizontal overflow, all filter controls 46px tall, desktop selects and Apply share the same vertical position.
- Search for Foleyix returns its listing. Combining popular order and editorial origin returns matching results and updates the URL.
- News, Blog and a Blog article rendered and were visually inspected. No database migration is required for this release.

Production revision, deployment status and live readback are recorded separately after deployment.
