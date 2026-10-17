---
approved: true
title: "GitHub Trending, Oct 17: official agent plugins and skills take off"
description: "Today's GitHub Trending: Anthropic's Claude Code plugins surge, Cursor's plugin spec and official Android skills join in, plus CLI-Anything, low-token local search and a local voice studio."
pubDate: 2026-10-17
category: "agents-automation"
tags: [github-trending, open-source, ai-agents, agent-skills, developer-tools, plugins]
toolRefs: [claude-code, cursor, elevenlabs]
sources:
  - { url: "https://github.com/trending", title: "GitHub Trending (daily)", observedAt: "2026-10-17" }
  - { url: "https://github.com/anthropics/claude-plugins-official", title: "anthropics/claude-plugins-official", observedAt: "2026-10-17" }
  - { url: "https://github.com/cursor/plugins", title: "cursor/plugins", observedAt: "2026-10-17" }
  - { url: "https://github.com/HKUDS/CLI-Anything", title: "HKUDS/CLI-Anything", observedAt: "2026-10-17" }
  - { url: "https://github.com/xerj-org/xerj", title: "xerj-org/xerj", observedAt: "2026-10-17" }
  - { url: "https://github.com/debpalash/VoiceStudio", title: "debpalash/VoiceStudio", observedAt: "2026-10-17" }
  - { url: "https://github.com/MadsLorentzen/ai-job-search", title: "MadsLorentzen/ai-job-search", observedAt: "2026-10-17" }
  - { url: "https://github.com/K-Dense-AI/scientific-agent-skills", title: "K-Dense-AI/scientific-agent-skills", observedAt: "2026-10-17" }
  - { url: "https://github.com/android/skills", title: "android/skills", observedAt: "2026-10-17" }
  - { url: "https://github.com/obra/superpowers", title: "obra/superpowers", observedAt: "2026-10-17" }
---

Today's [GitHub Trending](https://github.com/trending) is about official plugin and skill standards: Anthropic's Claude Code plugin directory jumped, while Cursor's plugin specification and the official Android agent skills repo joined the daily list. Data comes from the daily all-languages list, captured on October 17, 2026 at 08:21 (UTC+8). "Stars today" is the daily figure GitHub shows on the page; totals are the star counts shown at capture time.

## 1. anthropics/claude-plugins-official — Anthropic's Claude Code plugin directory

Anthropic's official, managed directory of high-quality Claude Code plugins. Python, Apache-2.0.

- **Stars today:** 1,552 (about 40.5k total; up from 307 yesterday)
- **Why it matters:** a second straight day on the list with sharply rising interest suggests official plugin distribution is becoming a real channel for agent tools.

[View on GitHub](https://github.com/anthropics/claude-plugins-official)

## 2. cursor/plugins — Cursor's plugin specification and official plugins

The Cursor plugin specification together with Cursor's official plugins. TypeScript; no license is listed on GitHub.

- **Stars today:** 278 (about 11.9k total)
- **Why it matters:** with both Claude Code and Cursor standardizing plugins, packaging a tool for both specs opens two distribution channels. Check licensing before reusing code, since none is declared.

[View on GitHub](https://github.com/cursor/plugins)

## 3. HKUDS/CLI-Anything — making all software agent-native

A project from HKUDS that generates agent-ready command-line interfaces for existing software, with a community CLI-Hub (`pip install cli-anything-hub`, then `cli-hub install <name>`). It targets agents such as Cursor, Claude Code and OpenClaw. Python, Apache-2.0.

- **Stars today:** 281 (about 53.5k total)
- **Why it matters:** SaaS products that ship a CLI or agent interface can be called directly by coding agents, which is a new way to get discovered.

[View on GitHub](https://github.com/HKUDS/CLI-Anything)

## 4. xerj-org/xerj — AI search over local data without grep token waste

One command indexes code, docs, logs and PDFs for search, RAG, security audits and agent memory; the project claims about 40× fewer tokens than grep and compatibility with Elasticsearch clients. Rust, Apache-2.0.

- **Stars today:** 1,648 (about 6.9k total; up from 715 yesterday)
- **Why it matters:** a cheaper route to local RAG and agent memory than stuffing whole repositories into the prompt, under a commercial-friendly license.

[View on GitHub](https://github.com/xerj-org/xerj)

## 5. debpalash/VoiceStudio — a fully local ElevenLabs alternative

An open-source, fully local voice studio for voice cloning, voice design, video dubbing, dictation, transcription and audiobook creation, claiming support for 646 languages. Python, AGPL-3.0.

- **Stars today:** 2,301 (about 71k total)
- **Why it matters:** local voice cloning remains a hot topic. AGPL-3.0 needs careful review before any commercial use, and several straight days of thousands of new stars may be partly marketing-driven.

[View on GitHub](https://github.com/debpalash/VoiceStudio)

## 6. MadsLorentzen/ai-job-search — a local AI job-search framework built on Claude Code

Runs on your machine to evaluate job postings, tailor CVs, write cover letters and prepare for interviews; the author encourages forking it. Python, MIT.

- **Stars today:** 898 (about 48.5k total, with about 16.6k forks)
- **Why it matters:** a clear example of a vertical workflow packaged on top of a coding agent. The unusually high fork-to-star ratio is worth keeping in mind when reading its popularity.

[View on GitHub](https://github.com/MadsLorentzen/ai-job-search)

## 7. K-Dense-AI/scientific-agent-skills — turn any agent into an AI scientist

A science skills library that says it ships 177 validated skills plus 100+ scientific databases, compatible with Cursor, Claude Code, Codex and the open Agent Skills standard. Python, MIT.

- **Stars today:** 1,158 (about 51.5k total)
- **Why it matters:** vertical skill packs have now trended for three days in a row, leaving room for other niches that still lack a standard pack.

[View on GitHub](https://github.com/K-Dense-AI/scientific-agent-skills)

## 8. android/skills — official Android agent skills

AI-optimized, modular instructions for Android development that follow the open Agent Skills (SKILL.md) standard, focused on areas where evaluations show LLMs underperform. Installable with the Android CLI via `android skills add`. Kotlin, Apache-2.0.

- **Stars today:** 36 (about 8.1k total)
- **Why it matters:** another platform owner adopting SKILL.md makes it look more and more like the common format for portable agent skills.

[View on GitHub](https://github.com/android/skills)

## 9. obra/superpowers — an agentic skills framework and methodology

A skills framework and software development methodology for coding agents: clarify requirements, write specs and plans, then execute with sub-agents. Shell, MIT.

- **Stars today:** 973 (about 301k total)
- **Why it matters:** a repeatable "spec, plan, execute" loop keeps agents on track across multiple projects.

[View on GitHub](https://github.com/obra/superpowers)

## Also on the list

- **affaan-m/ECC**, an agent harness performance system: 1,057 stars today (about 281k total).
- **ruvnet/ruflo**, a multi-agent swarm harness: 672 stars today (about 75.6k total).
- **mksglu/context-mode**, context-window optimization for coding agents: 449 stars today (about 30.2k total).
- **morluto/rea**, which posted suspiciously large daily star gains earlier this week, is no longer on today's daily list.

## The takeaway

Plugin and skill standards are consolidating fast: Anthropic, Cursor and the Android team all have official repos on today's board, and SKILL.md is showing up everywhere. For builders, two openings stand out: ship your product as an agent-callable plugin or CLI and submit it to official directories, and publish guides around "Claude Code plugins", "Cursor plugins" and "agent skills" while those topics are still young.
