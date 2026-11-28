---
approved: true
title: "Launch Weekly: Tools for work you need to repeat"
description: "Five editorial picks from 60 new listings so far this week: agent browsers, Roblox prototypes, image batches, subtitle recovery and structured market data."
pubDate: 2026-11-28
category: "Launch Weekly"
tags: [launch-weekly, product-reviews, workflow-tools, week-to-date]
toolRefs: [easi-run, levelshaper, imgbulk, geeklink, dataxapi, doodara, imagelier, ghost-mannequin-tool]
sources:
  - { url: "https://wishmeteor.net/api/content?limit=48", title: "WishMeteor public catalog and publication timestamps", observedAt: "2026-11-28" }
  - { url: "https://easi.run", title: "easi.run public product and deployment overview", observedAt: "2026-11-28" }
  - { url: "https://docs.easi.run", title: "easi.run session, control and API documentation", observedAt: "2026-11-28" }
  - { url: "https://github.com/julianosig/easi.run", title: "easi.run source and license", observedAt: "2026-11-28" }
  - { url: "https://levelshaper.com", title: "LevelShaper public map preview and editable export workflow", observedAt: "2026-11-28" }
  - { url: "https://imgbulk.co", title: "ImgBulk batch review workflow", observedAt: "2026-11-28" }
  - { url: "https://imgbulk.co/pricing", title: "ImgBulk current credit packs and quoting rules", observedAt: "2026-11-28" }
  - { url: "https://geeklink.dev", title: "GeekLink subtitle tasks, platform support and trial", observedAt: "2026-11-28" }
  - { url: "https://dataxapi.com/docs/", title: "DataXAPI response, billing and MCP documentation", observedAt: "2026-11-28" }
  - { url: "https://www.doodara.com", title: "Doodara free reading, gallery and paid export options", observedAt: "2026-11-28" }
  - { url: "https://imagelier.com/pricing", title: "Imagelier trial and production-export limits", observedAt: "2026-11-28" }
---

**November 23–28, 2026 · week to date · Beijing time**

**Snapshot: 28 Nov 2026, 08:32.** This is a Saturday progress edition, not a completed seven-day report. WishMeteor has added **60 listing records** since Monday. The preceding complete week contained **47**. Their reporting lengths differ, so the two totals are context rather than a growth rate.

This edition ranks five products by problem clarity, visible workflow, differentiation, repeat-use potential and the limits supported by public evidence. Community votes and engagement measurements are excluded. The question is whether a product can turn a recurring job into work that is easier to control and review. Potential is an editorial judgment, not measured adoption or a prediction of commercial success.

Today's 23-record batch includes 17 previously held submissions. Some entries are alternative domains or language routes for related projects, and two are marked beta because availability is limited or unverified. Publication dates below are dates of entry into WishMeteor, not original product launches. The additions should not be read as 60 independently verified businesses or a market-demand survey.

## 1. easi.run — the strongest repeat-workflow opportunity

[easi.run](/tool/easi-run) gives an external agent a real Chrome session on infrastructure controlled by the operator. A person can watch the session, take control for an interactive step and then return it to the agent. Its documentation covers MCP and HTTP access, saved profiles, file transfer and recording.

The product opportunity is a recurring operational problem: browser automation often needs both continuity and a person who can intervene. Bringing those controls into one session could reduce the work of reconstructing state after every interruption. An open repository also gives engineering teams a route to inspect and adapt the system rather than depending only on a hosted dashboard.

**Current limits.** This is self-hosted software, with Linux, Docker and server-operation requirements. Open-source availability does not remove hosting costs, model costs or responsibility for sensitive sessions. We reviewed the live site, public demo evidence and documentation, without deploying it on a server or conducting a security audit.

**What would strengthen the case:** measure how often an agent resumes successfully after human intervention across a small set of permitted workflows, and how much operator time is required per completed task. Recovery and control matter more here than a short, impressive demo.

## 2. LevelShaper — a concrete handoff into an existing game editor

[LevelShaper](/tool/levelshaper) starts with a Roblox game idea and offers a browser map preview plus an editable .rbxlx place for Roblox Studio. Its public examples and descriptions cover familiar patterns such as obbies, tycoons, checkpoints and shops.

The promising choice is the destination. A creator receives a project they can continue editing in Studio, which gives the product a role before the ordinary development and testing process. That creates a plausible reason to return for another map or prototype rather than treating the first generation as a finished game.

**Current limits.** Templates and AI-generated layouts still need inspection, configuration and play-testing. A first-game offer is separate from paid usage. We did not run an exported place in Roblox Studio, verify saving or purchases, or assess a published game's performance.

**What would strengthen the case:** compare correction time for several common prototypes against building them from a blank place. The useful measure is a playable, understandable project after editing, not the number of seconds until the first preview appears.

## 3. ImgBulk — useful coordination around image generation

[ImgBulk](/tool/imgbulk) lets a creator organize multiple prompts or reference tasks, review settings and credit estimates, and then track a batch. Its public workflow describes CSV/Excel imports, individual task retries and ZIP downloads. During this review, its three example prompts were carried into the actual task-review workspace without starting generation.

The opportunity is in coordination. Teams making a set of product scenes, editorial illustrations or storyboard frames already begin with a list. Keeping each brief, status and cost in a shared workflow can save repeated setup while preserving the ability to inspect results separately.

**Current limits.** Generation quality depends on the selected model and reference material. Credit quotes differ by resolution and workflow, and a low per-image estimate does not establish the cost of a usable final set. We inspected the task review and published pricing, without producing a paid batch or testing ZIP completeness.

**What would strengthen the case:** measure cost and review time for a fixed set of accepted images, including retries and rejected outputs. A trustworthy batch should also keep task names, files and billing aligned when only part of the run fails.

## 4. GeekLink — a clear job before translation and publishing

[GeekLink](/tool/geeklink) separates three subtitle problems: reading captions already embedded in video frames, transcribing speech, and translating subtitle files. Its desktop workflow includes line and timing review, followed by exports such as SRT or a subtitled video.

That separation makes the product easier to evaluate. Burned-in text, spoken audio and an existing subtitle file are different starting points; treating them as separate routes gives editors a better chance of choosing the right recovery step. Editable subtitle output connects the tool to an existing post-production workflow.

**Current limits.** The advertised Mac build targets Apple Silicon and a supported macOS version; Intel Macs are not listed as supported. A Pro trial and paid licenses are distinct, and local processing and cloud translation can have different requirements. We inspected public interfaces and specifications, without installing the app or testing recognition accuracy.

**What would strengthen the case:** compare correction minutes per ten minutes of footage across low-contrast burned-in captions, multiple speakers and mixed-language material. Exported timing and proper names deserve as much attention as initial recognition.

## 5. DataXAPI — integration potential, with data quality as the deciding test

[DataXAPI](/tool/dataxapi) documents a common REST response shape for public social, creator, advertising and commerce information, with MCP access for compatible assistants. Its documentation explains cursors, unavailable fields, account-key authentication and endpoint-specific billing.

The useful idea is reducing integration work across sources. A consistent envelope and an explicit account of missing fields can make a research workflow easier to maintain than a collection of unrelated responses. That is a plausible repeated-use opportunity for developers, provided the underlying information remains dependable.

**Current limits.** Source availability, permitted use, freshness and price vary by platform and endpoint. We reviewed public documentation and recorded examples; we did not create an account, make authenticated calls or verify the full advertised coverage. A common response format cannot guarantee that the underlying data is complete.

**What would strengthen the case:** run a permitted reference set repeatedly and record missing fields, freshness, failure handling and total billed cost. The business value depends on useful data arriving consistently, not only on an API being easy to call.

## Three more products worth watching

- **[Doodara](/tool/doodara):** a clear family or classroom workflow from story idea to illustrated online reading. The free watercolor option is for personal use; exports and commercial entitlements depend on the paid route. The public gallery makes visibility a decision to check before adding personal material. The next useful test is continuity and reading fit across a complete book.
- **[Imagelier](/tool/imagelier):** a focused repair task for text in flattened menus, posters and screenshots. Public examples make the job understandable, while free exports have size and watermark limits. Font matching and surrounding-pixel preservation need testing across difficult images rather than assuming every edit is exact.
- **[Ghost Mannequin Tool](/tool/ghost-mannequin-tool):** a practical catalog-photography use case with visible comparisons and acknowledged garment-detail changes. Its opportunity depends on reducing review and reshoot time without misrepresenting the item being sold.

## Three patterns in this week's additions

### 1. Operational control is becoming part of the product

easi.run exposes human control of a live session; ImgBulk exposes task review, quotes and individual retries; DataXAPI documents missing fields and billing. These are different products, but each puts a useful decision around an automated operation. The hypothesis is that visible state and recoverability can support repeat use. Reliability under interruptions remains the next thing to measure.

### 2. Editing and handoff deserve attention alongside generation

Image & Video accounts for **35 of 60 listings (58.3%)**. That group includes text replacement, cleanup, garment photography and reference editing as well as whole-image or video generation. GeekLink and the transcript tools carry work into editable subtitles, while LevelShaper targets a native game project. The recurring opportunity is a small, useful transformation that fits the next tool in the workflow.

### 3. Trial, privacy and reuse rights are product choices

A free preview is not always a production export. GistMint distinguishes signup credits from no-account subtitle tools; LoveImage's anonymous trial is watermarked and personal/non-commercial; Doodara separates free reading from paid export and reuse options. These limits affect whether a tool fits a job. Their value should be assessed before uploading sensitive material or budgeting for a finished set of outputs.

## Category context

The left column is a partial week; the right is a complete week. Counts describe public listing records at the snapshot, not unique project groups or demand. No week-over-week growth rate is inferred.

| Category | Nov 23–28, to snapshot | Nov 16–22, complete |
| --- | ---: | ---: |
| Image & Video | 35 | 26 |
| Voice & Music | 8 | 7 |
| Education & Learning | 3 | 2 |
| Marketing & Growth | 3 | 0 |
| Writing & Research | 3 | 3 |
| Business Services | 2 | 0 |
| Maker Tools | 2 | 4 |
| Agents & Automation | 1 | 0 |
| Chat & Assistants | 1 | 0 |
| Search & RAG | 1 | 0 |
| Models & Inference | 1 | 0 |
| New discoveries | 0 | 5 |
| **Total** | **60** | **47** |

## Every listing added this week so far

Publication order, using Beijing dates. A domain-qualified name distinguishes a route when identity or ownership should not be assumed. Beta entries are included in the inventory, not presented as verified working services.

| Date | Listing | Focus | Status |
| --- | --- | --- | --- |
| 11-23 | [CoverTune](/tool/covertune) | Rework an uploaded song into a different musical style, with lyric choices and downloadable MP3 takes. | Public listing |
| 11-23 | [FloofVid](/tool/floofvid) | Turn one or two pet photos into short dancing, singing, talking or birthday videos with scene controls. | Public listing |
| 11-23 | [TranscribeBolt](/tool/transcribebolt) | Convert audio or video recordings into editable text, timestamped transcripts and downloadable SRT or VTT subtitles. | Public listing |
| 11-23 | [ChipmunksDanceAI.app](/tool/chipmunks-dance-ai-app) | Cast one to three photos in a fixed trio dance routine and export a short portrait MP4 with sound or a silent copy. | Public listing |
| 11-24 | [TextImageEdit](/tool/textimageedit) | Replace words already inside a photo or graphic, using the original lettering and surroundings as a visual reference. | Public listing |
| 11-24 | [Auteo](/tool/auteo) | Explore video, image, voiceover and music ideas in a creative workspace with model choices and credit quotes. | Public listing |
| 11-24 | [Whisper Web](/tool/whisper-web) | Transcribe audio with a free on-device browser mode or an optional paid cloud workflow for larger recordings. | Public listing |
| 11-24 | [Live Face Swap](/tool/live-face-swap) | Preview webcam face swapping, scene restyling or outfit effects in a browser studio with cloud video processing. | Public listing |
| 11-24 | [Imgraft](/tool/imgraft) | Restyle a photo with visual presets or a written instruction, compare results and branch from earlier editing steps. | Public listing |
| 11-25 | [PasteQuill](/tool/pastequill) | Read video captions as timestamped transcripts, copy clean text, or download TXT and SRT files from public links. | Public listing |
| 11-25 | [EveryGen AI](/tool/everygen-ai) | Plan a visual idea, create a starter image and compare credit-priced text-to-video or image-to-video workflows. | Public listing |
| 11-25 | [LevelShaper](/tool/levelshaper) | Describe a Roblox game idea, preview its map in the browser and export an editable .rbxlx place for Roblox Studio. | Public listing |
| 11-25 | [Buzzsift](/tool/buzzsift) | Research public brand conversations with linked-source reports, sentiment summaries and optional AI assistant access. | Public listing |
| 11-25 | [Pet Tarot Cards](/tool/pet-tarot-cards) | Turn a pet photo into personalized tarot artwork, with a free first card and paid decks, guidebooks and print files. | Public listing |
| 11-25 | [GenderSwapApp](/tool/genderswapapp) | Explore more feminine or masculine portrait styling from a photo, with two free images and optional prepaid credits. | Public listing |
| 11-25 | [DLSS 5 Guide](/tool/dlss-5-guide) | Look up GPU names against an independent DLSS compatibility guide and read links to published NVIDIA information. | Public listing |
| 11-25 | [How Attractive Am I](/tool/how-attractive-am-i) | Explore photo-based facial proportion measurements and hairstyle ideas through a free browser tool with an optional paid report. | Public listing |
| 11-25 | [Luvvoice](/tool/luvvoice) | Convert text or documents into downloadable speech, with standard voices, audiobook tools and optional voice cloning. | Public listing |
| 11-25 | [Multiple Face Swap AI](/tool/multiple-face-swap-ai) | Assign different replacement faces to people in group photos, videos or GIFs through a browser workspace. | Public listing |
| 11-26 | [Tellreel](/tool/tellreel) | Create narrated vertical videos from a topic, combining scripts, illustrations and animated captions in one workflow. | Public listing |
| 11-26 | [Magi2AI](/tool/magi2ai) | Create short audiovisual clips from scene prompts and reference images through an independent MAGI-2 web studio. | Public listing |
| 11-26 | [Voiceslab](/tool/voiceslab) | Create speech from scripts with standard voices or a permitted voice sample, with free allowances and paid usage options. | Public listing |
| 11-26 | [WelchesLLM](/tool/welchesllm) | Explore local LLM hardware fit, model comparisons and GPU offers through the German-language edition of the QuelLLM project. | Public listing |
| 11-26 | [RegulIA](/tool/regulia) | Use a French-language AI Act questionnaire to identify topics to review, with optional personalized documentation packs. | Public listing |
| 11-26 | [Hand On Web AI Visibility Checker](/tool/hand-on-web-ai-visibility-checker) | Request a human-reviewed report on how selected AI assistants mention a business, with sources and suggested improvements. | Public listing |
| 11-26 | [easi.run](/tool/easi-run) | Run Chrome sessions on your own Linux server for AI agents, with live viewing, human takeover and saved browser profiles. | Public listing |
| 11-27 | [Ghost Mannequin Tool](/tool/ghost-mannequin-tool) | Turn existing clothing photos into invisible-mannequin, flat-lay, recolored or on-model catalog images. | Public listing |
| 11-27 | [H3Img](/tool/h3img) | Generate still images or edit reference photos in an independent MiniMax H3 Image browser studio with visible credit quotes. | Public listing |
| 11-27 | [IAPRO](/tool/iapro) | Explore AI workflow scenarios with a free French-language calculator, alongside paid deployment, training and consulting services. | Public listing |
| 11-27 | [La Gazette IA](/tool/la-gazette-ia) | Read French-language AI news, practical guides and editorial tool roundups before exploring the linked services yourself. | Public listing |
| 11-27 | [GistMint](/tool/gistmint) | Turn video captions into searchable transcripts and subtitle exports, with optional paid transcription and summarization tools. | Public listing |
| 11-27 | [DataXAPI](/tool/dataxapi) | Connect software or AI assistants to structured public social, creator, advertising and commerce data through REST or MCP. | Public listing |
| 11-27 | [SkipperGrowth](/tool/skippergrowth) | Explore website SEO and AI-search readiness through a browser console with free checks and optional paid monitoring or reviews. | Public listing |
| 11-27 | [ImgBulk](/tool/imgbulk) | Organize multiple image prompts or reference tasks in one batch, review credit estimates and download completed results together. | Public listing |
| 11-27 | [LoveImage](/tool/loveimage) | Explore prompt-based image and video creation with reference workflows, editing tools and a limited no-signup image trial. | Public listing |
| 11-27 | [PNGMaker](/tool/pngmaker) | Create prompt-based PNG assets with transparency options, style presets and a background-removal tool for existing images. | Public listing |
| 11-27 | [LoreTypes](/tool/loretypes) | Explore free themed quizzes for self-reflection, including aura colors, archetypes, alignment and fictional past-life stories. | Public listing |
| 11-28 | [ViewMax AI Tone Rewriter](/tool/viewmax-ai-tone-rewriter) | Explore a planned tone-rewriting workflow for scripts and captions inside the ViewMax creative suite. | Beta / check availability |
| 11-28 | [PSL Ratings](/tool/psl-ratings) | Explore photo-based facial proportion estimates with a free basic rating and links to more detailed reports. | Public listing |
| 11-28 | [PayForGPT](/tool/payforgpt) | Browse a third-party subscription storefront with published prices, order lookup and assisted activation procedures. | Public listing |
| 11-28 | [Meigen AI (ai-meigen.com)](/tool/meigen-ai-ai-meigen) | Create images or short videos from prompts and references through the ai-meigen.com browser workspace. | Public listing |
| 11-28 | [EaseMate AI (easemate.net)](/tool/easemate-ai-easemate-net) | Explore image generation, short-video tools and photo transformations in the easemate.net browser suite. | Public listing |
| 11-28 | [Genjutsu AI (genjutsu.video)](/tool/genjutsu-video) | Recast a source video with reference characters using a browser-based motion-transfer workflow. | Public listing |
| 11-28 | [Wan3 AI (wan3.io)](/tool/wan3-io) | A submitted text-and-image video-generation service whose browser accessibility remains unverified. | Beta / check availability |
| 11-28 | [Bulin 47 AI (bulinaivideo.org)](/tool/bulin-ai-video-org) | Place an authorized portrait into a fictional music-performance clip using a focused browser video workflow. | Public listing |
| 11-28 | [Tesla Roadster AI (teslaroadsterai.org)](/tool/tesla-roadster-ai-org) | Turn a vehicle or subject photo into a fictional stunt clip using ready-made ramp and flying-car scenes. | Public listing |
| 11-28 | [ConsistentCharacterAI (.com)](/tool/consistentcharacterai-com) | Develop reference-led character images and explore related portrait or style workflows in a browser. | Public listing |
| 11-28 | [Opus 5.5 Video (opusvideogen.com)](/tool/opusvideogen) | Turn a written brief or product idea into a code-rendered motion-graphics video through a browser workspace. | Public listing |
| 11-28 | [Tiny Desk AI (tinydeskvideo.org)](/tool/tiny-desk-ai-org) | Transform a permitted portrait or group image into a fictional miniature live-band performance clip. | Public listing |
| 11-28 | [AI Manga Translator (.net)](/tool/ai-manga-translator-net) | Translate text in manga-page images with a browser workflow for page uploads, language choices and reviewed output. | Public listing |
| 11-28 | [Live Face Swap (.online)](/tool/live-face-swap-online) | Preview cloud-based webcam transformations and create themed photos or short character clips in a browser. | Public listing |
| 11-28 | [Image Describer (.app)](/tool/image-describer-app) | Turn images into editable descriptions, alt-text drafts, extracted text or creative prompts through a free browser tool. | Public listing |
| 11-28 | [MAGI-2 Studio (magi-2ai.org)](/tool/magi-2ai-studio) | Plan short visual scenes from prompts and reference media in the magi-2ai.org creative workspace. | Public listing |
| 11-28 | [QuelLLM](/tool/quelllm) | Browse a French local-model catalog, hardware-fit resources and public data interfaces from the QuelLLM project. | Public listing |
| 11-28 | [Imagelier](/tool/imagelier) | Replace text in flattened images through a focused editor for screenshots, menus, posters and product visuals. | Public listing |
| 11-28 | [ImgLoop](/tool/imgloop) | Combine prompt-based photo edits with local canvas tools for cleanup, restoration, background changes and relighting. | Public listing |
| 11-28 | [Vidloop](/tool/vidloop) | Create short videos from prompts, source images or references in a multi-model workbench with quoted credit costs. | Public listing |
| 11-28 | [GeekLink](/tool/geeklink) | Extract burned-in subtitles, transcribe speech and translate subtitle files in a desktop editing and export workflow. | Public listing |
| 11-28 | [Doodara](/tool/doodara) | Turn a story idea into an illustrated picture book with age, language and style choices and an online reading preview. | Public listing |
| 11-28 | [Remove Text From Video](/tool/remove-text-from-video-net) | Preview removal of burned-in captions or text overlays from authorized clips before paying to process the full video. | Public listing |

## Scope and method

The current window starts **November 23 at 00:00 Asia/Shanghai** and ends at the snapshot above, with the right boundary excluded. In UTC it is **2026-11-22T16:00:00.000Z** through **2026-11-28T00:32:55.572Z**. The comparison window is the preceding complete Monday-to-Monday week. Membership uses publishedAt and includes records still public at collection; each slug is counted once.

The collection read **31 consistent-version pages covering 1447 public records** and retained only product descriptions, categories, URLs, pricing, status and publication dates. Ranking is an editorial assessment of the product and its potential. Public pages, examples, documentation and pricing were reviewed; paid output quality, deployment security, downstream imports and complete API coverage were not independently established. Listing approval is distinct from product testing, model affiliation or endorsement of every vendor claim.
