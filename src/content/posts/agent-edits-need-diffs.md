---
title: "Agent edits are a review problem, not a generation problem"
description: "Every coding agent that survives contact with a real repository lands on the same feature: a diff you can accept in pieces. Here is what that says about the category."
pubDate: 2026-09-29
category: "ai-coding"
tags: [agents, code-review, developer-tools]
toolRefs: [cursor, aider, langfuse]
sources: [{ url: "https://aider.chat/docs/git.html", title: "Aider git documentation", observedAt: "2026-09-29" }]
---

The interesting convergence in AI coding tools is that none of them argue about generation quality any more. They argue about what happens after generation. [Cursor](/tool/cursor) built its workflow around chunked diffs. [Aider](/tool/aider) commits every accepted change with a generated message. Terminal agents that started as one-shot patch appliers now ship a "review this before it lands" step, and the ones that do not are used for greenfield demos rather than Tuesday afternoon bugfixes.

That shift is worth naming precisely, because it is an admission. Model output is good enough that the bottleneck moved: the scarce resource is no longer a plausible patch, it is a patch a human can verify in ninety seconds. A tool that produces three correct files and one quietly-wrong deletion has cost you more time than it saved, and you will not trust it again next week — which is the actual mechanism behind "the agent is unreliable".

## Why commits and chunks behave the same way

Both designs solve the same problem: making the unit of review smaller than the unit of generation. Aider's commit-per-change approach means `git revert` is the undo button, so recovery does not depend on the tool remembering what it touched. Cursor's per-hunk acceptance means the review surface is the diff, not the file. Same instinct, different substrate — one leans on git, the other on the editor.

Notice what neither one does: it does not make the model more reliable. It makes your verification cheap. That is the honest framing of this whole category, and it is why "how confident is the model" is the wrong question to ask of a coding tool. Ask instead what the blast radius is when it is wrong, and how long the rollback takes.

## The part nobody has solved yet

Review tooling has outrun evidence. Every one of these products will happily show you a diff; almost none can tell you whether the change passed tests, whether it was accepted because it was correct or because you were in a hurry, and what your personal accept-and-then-revert rate looks like over a month. That is an observability problem, and the tooling for it lives in a different category entirely — [tracing and eval platforms](/tool/langfuse) have been solving exactly this shape of question for LLM applications, but nobody has ported it to the coding-agent loop at scale.

If you are evaluating these tools for a team, the useful metric is not lines accepted. It is time-to-revert on accepted changes, and how often a reverted edit was later reproduced by the same agent. Most teams have never measured either, and both are cheap to instrument.

## What to watch over the next quarter

Three things look likely from where the index sits. First, sandboxing will move from a checkbox to the main event: an agent that can run tests and iterate is useful, and the difference between it and one that can also push is permissions. Second, per-repository context is being commoditised — indexing is no longer a differentiator, so the competition is moving to how a tool handles a codebase it disagrees with. Third, someone will ship the review-quality analytics described above, and it will be uncomfortable for the vendors whose numbers are bad, which is how you will know it is real.

The short version: pick the tool whose failure is cheapest to notice. Everything else is benchmark theatre.
