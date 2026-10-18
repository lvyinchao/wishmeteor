---
approved: true
title: "GitHub Trending, Oct 18: coding agents learn to share memory"
description: "Today's GitHub Trending: cross-agent memory with ai-memory, OpenCode and the Orca agent orchestrator, Anthropic's Claude Code plugins, low-token local search and a local voice studio."
pubDate: 2026-10-18
category: "agents-automation"
tags: [github-trending, open-source, ai-agents, coding-agents, agent-memory, developer-tools]
toolRefs: [claude-code, cursor, elevenlabs]
sources:
  - { url: "https://github.com/trending", title: "GitHub Trending (daily)", observedAt: "2026-10-18" }
  - { url: "https://github.com/anthropics/claude-plugins-official", title: "anthropics/claude-plugins-official", observedAt: "2026-10-18" }
  - { url: "https://github.com/akitaonrails/ai-memory", title: "akitaonrails/ai-memory", observedAt: "2026-10-18" }
  - { url: "https://github.com/stablyai/orca", title: "stablyai/orca", observedAt: "2026-10-18" }
  - { url: "https://github.com/anomalyco/opencode", title: "anomalyco/opencode", observedAt: "2026-10-18" }
  - { url: "https://github.com/xerj-org/xerj", title: "xerj-org/xerj", observedAt: "2026-10-18" }
  - { url: "https://github.com/debpalash/VoiceStudio", title: "debpalash/VoiceStudio", observedAt: "2026-10-18" }
  - { url: "https://github.com/HKUDS/CLI-Anything", title: "HKUDS/CLI-Anything", observedAt: "2026-10-18" }
  - { url: "https://github.com/android/skills", title: "android/skills", observedAt: "2026-10-18" }
  - { url: "https://github.com/MadsLorentzen/ai-job-search", title: "MadsLorentzen/ai-job-search", observedAt: "2026-10-18" }
---

Today's [GitHub Trending](https://github.com/trending) shows developers running several coding agents side by side: Claude Code and OpenCode are both on the board, Orca orchestrates agents in parallel, and the newcomer ai-memory hands context from one agent to the next. Data comes from the daily all-languages list, captured on October 18, 2026 at 08:17 (UTC+8). "Stars today" is the daily figure GitHub shows on the page; totals are the star counts shown at capture time.

## 1. anthropics/claude-plugins-official — Anthropic's Claude Code plugin directory

Anthropic's official, managed directory of high-quality Claude Code plugins. Python, Apache-2.0.

- **Stars today:** 1,397 (about 41.7k total; 1,552 yesterday)
- **Why it matters:** a third straight day on the list makes the official directory look like the main distribution channel for Claude Code extensions.

[View on GitHub](https://github.com/anthropics/claude-plugins-official)

## 2. akitaonrails/ai-memory — long-term memory shared across coding agents

Long-term memory for AI coding agents: quit Claude Code mid-task, start Codex in the same directory and continue without re-explaining the architecture, failed approaches or open questions. The project says it supports more than twenty harnesses, including Claude Code, Codex, Cursor, Gemini CLI, OpenCode and Grok, and keeps memory on a server you run so it follows you across machines and teammates. Rust, MIT.

- **Stars today:** 178 (about 9.9k total; new on the daily list)
- **Why it matters:** as people switch between agents, a self-hosted, vendor-neutral memory layer removes the cost of re-explaining context every time.

[View on GitHub](https://github.com/akitaonrails/ai-memory)

## 3. stablyai/orca — a workspace for a fleet of coding agents

An orchestrator that runs Codex, Claude Code, OpenCode or Pi side by side, each in its own git worktree, with desktop apps and an iOS and Android companion for monitoring and steering agents remotely. TypeScript, MIT.

- **Stars today:** 830 (about 95.4k total)
- **Why it matters:** parallel agents in isolated worktrees let one builder push several projects forward at once.

[View on GitHub](https://github.com/stablyai/orca)

## 4. anomalyco/opencode — the open-source coding agent

An open-source coding agent for the terminal. TypeScript, MIT.

- **Stars today:** 438 (about 215k total; new on the daily list)
- **Why it matters:** several other trending projects today, including ai-memory, Orca, ECC and ruflo, list OpenCode as a supported agent, so it is worth supporting alongside Claude Code and Codex.

[View on GitHub](https://github.com/anomalyco/opencode)

## 5. xerj-org/xerj — AI search over local data without grep token waste

One command indexes code, docs, logs and PDFs for search, RAG, security audits and agent memory; the project claims about 40× fewer tokens than grep and Elasticsearch compatibility. Rust, Apache-2.0.

- **Stars today:** 1,160 (about 7.8k total)
- **Why it matters:** a cheaper route to local RAG than stuffing repositories into the prompt. The repo was created in June 2026 and has gained more than a thousand stars a day for several days, a steep curve worth watching before relying on it.

[View on GitHub](https://github.com/xerj-org/xerj)

## 6. debpalash/VoiceStudio — a fully local ElevenLabs alternative

An open-source, fully local voice studio for voice cloning, voice design, video dubbing, dictation, transcription and audiobook creation, claiming support for 646 languages. Python, AGPL-3.0.

- **Stars today:** 2,125 (about 73.3k total; the highest daily gain on today's list)
- **Why it matters:** local voice cloning keeps drawing attention. AGPL-3.0 needs careful review before commercial use, and four straight days of 2,000+ new stars may be partly marketing-driven.

[View on GitHub](https://github.com/debpalash/VoiceStudio)

## 7. HKUDS/CLI-Anything — making all software agent-native

Generates agent-ready command-line interfaces for existing software, with a community CLI-Hub at clianything.cc. Python, Apache-2.0.

- **Stars today:** 574 (about 54.1k total; up from 281 yesterday)
- **Why it matters:** products that ship a CLI can be called directly by coding agents, which opens a new discovery channel.

[View on GitHub](https://github.com/HKUDS/CLI-Anything)

## 8. android/skills — official Android agent skills

Modular Android development instructions that follow the open Agent Skills (SKILL.md) standard, focused on areas where LLMs underperform. Kotlin, Apache-2.0.

- **Stars today:** 355 (about 8.4k total; up from 36 yesterday)
- **Why it matters:** SKILL.md keeps gaining ground as the portable format for agent skills.

[View on GitHub](https://github.com/android/skills)

## 9. MadsLorentzen/ai-job-search — a local AI job-search framework built on Claude Code

Runs on your machine to evaluate job postings, tailor CVs, write cover letters and prepare for interviews. Python, MIT.

- **Stars today:** 1,365 (about 50.4k total, with about 16.9k forks; 898 yesterday)
- **Why it matters:** vertical workflows packaged on a coding agent keep growing. The fork count, roughly a third of the star count, is unusually high and worth keeping in mind.

[View on GitHub](https://github.com/MadsLorentzen/ai-job-search)

## Also on the list

- **affaan-m/ECC**, an agent harness performance system: 1,145 stars today (about 283k total).
- **K-Dense-AI/scientific-agent-skills**, a science skills library for agents: 878 stars today (about 52.2k total).
- **ruvnet/ruflo**, a multi-agent swarm harness: 420 stars today (about 76.1k total).
- **anthropics/claude-code**, Anthropic's terminal coding agent: 179 stars today (about 152k total).

## The takeaway

Developers no longer stick to a single coding agent. Claude Code and OpenCode trend together, Orca runs them in parallel, and ai-memory carries context between them. For builders, that means shipping skills and plugins that work across agents using the SKILL.md format, and writing guides around topics like "agent memory", "OpenCode vs Claude Code" and "running multiple coding agents" while search interest is still new.
