<div align="center">

**English** | [中文](README.md)

</div>

<p align="center">
  <img src="docs/assets/readme/ai-writer-logo-transparent.png" width="104" height="104" alt="AI Writer Logo" />
</p>

<h1 align="center">AI Writer</h1>

<p align="center">
  A local-first desktop workspace for long-form fiction. It organizes “premise → characters → worldbuilding → chapter blueprints → draft → review → revision → final” as a traceable writing workflow. You configure the model; your project material stays on your computer.
</p>

<p align="center">
  <a href="https://github.com/poluce/ai-writer/releases"><img src="https://badgen.net/github/tag/poluce/ai-writer?label=release" alt="Release" /></a>
  <a href="https://github.com/poluce/ai-writer/blob/main/LICENSE"><img src="https://badgen.net/badge/license/GPL-3.0/blue" alt="GPL-3.0 License" /></a>
  <a href="https://github.com/poluce/ai-writer/stargazers"><img src="https://badgen.net/github/stars/poluce/ai-writer" alt="GitHub stars" /></a>
</p>

<p align="center">
  <a href="https://github.com/poluce/ai-writer/releases/latest">Download desktop (Windows x64)</a>
</p>

<p align="center">
  <img src="docs/assets/readme/hero-en-v2.png" alt="AI Writer — a local-first desktop workspace for long-form fiction" width="100%" />
</p>

> ## v0.1.2 — fix missing app icons in installed builds
>
> Fixed the title-bar and status-bar app icons in installed builds: the packaged renderer loads pages from file://, so icon URLs now resolve through Vite's BASE_URL and stay correct in both development and packaged runs. A regression guard now forbids absolute public-asset URLs in the renderer.
>
> ## v0.1.1 — global update reminder with one-click download and restart
>
> A persistent in-app reminder directly offers "Download update" and "Remind me later" when a new stable release is found; the same reminder switches to "Restart and update" once the download finishes, after checking active creative tasks and unsaved edits. The reminder returns if the guard is cancelled, failed downloads offer a retry, and a 7-day deferral restores the reminder automatically. Installs on v0.1.0 receive this reminder.
>
> ## v0.1.0 — first release of the independent line
>
> This repository derives from upstream GPL-3.0 code and now ships independently: the app identity (appId, install directory, update channel) no longer collides with older builds, and versioning restarts at 0.1.0.
>
> - **Assistant delegation and queueing** — The project assistant can delegate work to the architecture and chapter-blueprint assistants; their sessions are reused and queued when busy instead of spawning fragmented conversations.
> - **Instant tool-confirmation feedback** — Approving a tool flips its card to running immediately and routes the confirmation back to the conversation that owns the card.
> - **Notebook-style outline volumes** — Volume tabs can be reordered by dragging, the table-of-contents width is draggable and remembered, and later volumes no longer merge into the preceding chapter range.
> - **Structured setting cards** — Premise, setting, and characters render as section cards that stay editable in place; story architecture follows premise → setting → plot → characters.

### Current capabilities

- Writing Skills can be installed independently and used for planning, drafting, review, or polishing.
- The story map shows main and side-story progress and links to the supporting chapter.
- Planning material can be imported so blueprints and later writing share the same settings.
- The character roster adds explicitly confirmed blueprint characters and tracks their state.
- The Chinese long-form workflow connects blueprints, drafts, reviews, revisions, and final chapters.
- Windows users receive an in-app reminder for new releases and can download, restart, and finish the update in one flow.

See the [bilingual 0.1.2 notes](.release/notes/v0.1.2.md) for each change. Official installers are published through this repository's [GitHub Releases](https://github.com/poluce/ai-writer/releases/latest).

> ## Feature baseline inherited from upstream (historical)
>
> Earlier upstream builds established continuity, chapter control, and review-driven revision for long-form fiction, shipping Windows, macOS Apple Silicon, and macOS Intel installers:
>
> - **Long-form continuity context** — Explicit author settings, the premise, characters, worldbuilding, outline, blueprints, and finalized facts carry into later writing to reduce forgotten setup and contradictions.
> - **Foreshadowing and narrative threads** — See suggested hooks, planting and payoff chapters, active threads, and overdue reminders in one place, making long-running suspense easier to plan and resolve.
> - **EPUB import and an interactive character graph** — Import EPUB2 / EPUB3 text through the existing chapter-splitting flow; zoom, pan, or clear the character relationship graph.
> - **Per-chapter model and length control** — Single-chapter and continuous writing honor the selected model and target length for each run. Duplicate jobs for the same target are blocked with a clear notice.
> - **Human-confirmed review loop** — Edit, ignore, or add review items, confirm the checklist, revise from that confirmed guidance, then inspect the diff before choosing whether to merge.
> - **Smoother model setup** — Advanced model settings expose supported reasoning effort and temperature controls. After entering an API key and Base URL, fetch the model list directly without first saving an incomplete configuration.
> - **More precise failure messages** — Content restrictions, provider failures, and duplicate jobs report a more specific cause, and incomplete output is not saved as successful project content.
>
> One Release uses the exact seven-asset contract: `ai-writer-setup-0.9.0.exe`, `ai-writer-setup-0.9.0.exe.blockmap`, `latest.yml`, `ai-writer-mac-arm64-0.9.0-installer.dmg`, `ai-writer-mac-arm64-0.9.0-installer.dmg.sha256`, `ai-writer-mac-x64-0.9.0-installer.dmg`, and `ai-writer-mac-x64-0.9.0-installer.dmg.sha256`. The Windows installer is not code-signed; both macOS installers use ad-hoc signing, have no Developer ID signature, and are not notarized, so their platform security prompts may require manual confirmation on first launch.



## What this product is

AI Writer is not a hosted model service or an online fiction platform. It is the orchestration layer for a writing project: it keeps project state, organizes prompts and context, manages blueprints and draft versions, and connects generation, review, and revision.

You may connect local or cloud models; the app does not provide or host model quotas. For long-form work, it assembles the current chapter blueprint, relevant character material, worldbuilding, history summaries, and optional style references instead of putting an entire novel into one chat transcript.

```mermaid
flowchart LR
  A[Premise] --> B[Characters and worldbuilding]
  B --> C[Outline and chapter blueprints]
  C --> D[Chapter draft]
  D --> E[Review report]
  E --> F[Revision and finalization]
  F --> G[Context for the next chapter]
```

## Interface preview

![AI Writer main window showing the project structure, welcome page, AI writing assistant and task panel](docs/assets/readme/ui-en.png)

## Core capabilities

| Capability | What it does |
| --- | --- |
| Structured writing workflow | Organizes premises, characters, worldbuilding, blueprints, drafts, reviews, revisions, and finals by stage. |
| Chapter-level generation | Builds context around the current chapter blueprint and related material to reduce cross-chapter drift. |
| Failed-generation recovery | If chapter generation fails after producing visible prose, the app saves it as a project-local recovery candidate; it is not a formal draft and cannot be continued after its source blueprint or draft changes, but it can be discarded. |
| Review and revision | Produces structured review information for a draft and uses that report as revision input. |
| Character cards and project material | Maintains characters, worldbuilding, blueprints, drafts, and finals in the project. Project sessions prevent an old window from writing into a newly reopened project. |
| Plot tree and narrative threads | Shows main plots, subplots, and source progress on chapter tracks. The plot tree is a rebuildable read-only snapshot, not a replacement for author facts. |
| Writing Skills and prompt templates | Binds supplemental methods by writing stage and customizes Chinese or English creative guidance while hidden contracts preserve language, output structure, and tool protocols. |
| Writing-style control | Finalizing a chapter does not automatically rewrite the style in the novel configuration. You can still edit it manually, run writing-style analysis, or import a novel to build imitation guidance. |
| Reference text and knowledge base | Imports common text formats as reference material. SQLite FTS remains available when no embedding model is configured. |
| Batch writing task | A separate batch chapter task supports 1–10 chapters, pause, and cancel; downstream processing failure stops later chapters. |
| Chinese and English UI | The first launch can follow the system locale; a manual choice is persisted. |
| Writing assistant | The side panel offers two assistants. The **project assistant** works on the open project — it can read project material, start workflows, and read or write files and run commands inside the project folder (each one needs your confirmation), keeping its conversations inside the project folder. The **app assistant** needs no project, is always available, works in its own `~/.vela/workspace`, and keeps its conversations in the app data folder. Opening a project switches to the project assistant automatically. Skill instructions are loaded on demand: the listing carries names and descriptions only. |

When generating a plot outline, you can enter an explicit chapter range in “Generate story architecture.” Projects longer than 20 chapters default to Chapters 1–20. After one batch finishes, continue from the next chapter; if generation stops with a valid checkpoint, resume from it. If you edit the existing outline or any source settings or guidance used for generation, the old checkpoint cannot continue directly into the new content; regenerate the affected range instead.

## Model configuration

The app currently supports two request protocols:

- **OpenAI-compatible** — for OpenAI, DeepSeek, Ollama, and other compatible Chat Completions services.
- **Native Gemini** — for Google Gemini-compatible endpoints.

“Custom API” means a configurable URL, model identifier, and credential within those protocols. It is not an arbitrary HTTP protocol editor or a place to run user-supplied scripts. Protocols such as Anthropic Messages, Azure OpenAI, or native KoboldAI require dedicated adapters rather than a URL swap.

Writing generation requires **native function / tool calling**. Structured results and chapter prose are submitted once through tools; the app no longer parses JSON or XML out of the model’s visible text. Project files, model profiles, and prompt overlays stay in the same locations. If an old custom prompt still says “output JSON only,” restore the built-in default in Settings.

### Ollama

Use Ollama through its OpenAI-compatible service:

```text
Provider:  Ollama (local) or Custom
Protocol:  OpenAI-compatible
Base URL:  http://127.0.0.1:11434/v1
API key:   may be left blank; if the UI requires one, use a local placeholder
Model:     your Ollama model name, for example qwen3:14b
```

Embedding models should also use `/v1`. Do not set the Base URL to `http://127.0.0.1:11434/api`: `/api` is Ollama's native path, not the OpenAI-compatible embedding path used by this application.

## Data, privacy, and boundaries

| Data or behavior | Default location / destination |
| --- | --- |
| Novel projects, characters, blueprints, drafts, and finals | Your project folder and local SQLite database. |
| Failed-generation recovery candidates | Stored only in the current project's local SQLite database; they do not automatically become drafts, finals, or continuity facts. |
| Imported reference material | Remains within the local project scope unless you choose to send it to a cloud model. |
| Local-model requests | Sent to the local or LAN inference service you configure. |
| Cloud-model requests | Prompts and context go to the provider you choose, such as OpenAI, DeepSeek, Gemini, or another cloud endpoint. |
| Model configuration and API keys | Currently stored in the local user-profile file `~/.vela/models.json`; protect your OS account and do not share this file. |
| App preferences and deferred-update settings | Stored in `~/.vela/config.json`. |

The app does not provide model accounts, cloud generation, or operational-message pushes. Update checks read public GitHub Releases only; users can check manually and defer a discovered version reminder.

## Installation and updates

### Windows x64

Formal releases use a Windows NSIS installer:

```text
ai-writer-setup-<version>.exe
```

1. Download formal installers only from [GitHub Releases](https://github.com/poluce/ai-writer/releases/latest).
2. The installer updates the application and should not delete novel projects, character cards, or existing settings. Back up important work before any upgrade.
3. After installation, use **Check for updates** on the welcome page. The app also performs at most one successful silent check per local day after startup. A discovered update is announced first and downloads only after the user chooses **Download update**; when the download finishes, the app offers **Restart and update / Later**.
4. Older portable ZIP builds cannot obtain their first updater automatically. Install a formal installer manually once; new portable ZIP releases are no longer maintained.

The installer is not code-signed at present. Windows may show publisher or reputation warnings; continue only after confirming that the download page is this repository's official GitHub Release.

### macOS

0.1.2 does not ship a macOS installer yet: this release line qualifies and publishes Windows x64 first. macOS installers return in a later version, still as separate ARM64 and Intel builds.

## Current limits

- A URL and key do not guarantee support for every third-party API; only implemented protocols and presets are in scope.
- The app does not replace authorial judgment, fact checking, or copyright decisions. Review AI output before using it.
- It does not provide online publishing, a reading community, or cloud-model accounts.
- Formal installers are built in GitHub Actions. The Windows x64 candidate must pass its qualification before it is listed in a GitHub Release.

## Development and architecture documentation

See [`docs/README.md`](docs/README.md) for documentation authority, ADRs, research, and agent collaboration guidelines.

## License

[GPL-3.0](LICENSE)
