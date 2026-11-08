---
description: "Persian RTL Web UI (دستیار هوشمند ارس) and Host HTTP/SSE bridge plugin that overrides or stands alongside the default DeepSeek Harness Web UI."
kind: "package-reference"
---

# @deepseek-ai/dsh-aras-ui

## Summary

`@deepseek-ai/dsh-aras-ui` provides a full Persian RTL (`dir="rtl"`) browser interface modeled on **دستیار هوشمند ارس** (`Aras Smart Assistant`) backed directly by DeepSeek Harness Host services (`session`, `settings`, `agentPresets`, `agentDefaultModel`, `llm`, `secretStore`, `approval/*`, and `user-questions/*`).

It supports two runtime composition modes:

1. **Overriding `dsh web` (`ctx.webServer` present)**: disables the default React SPA (`web-runtime`) and claims `ctx.webServer.registerFallback(...)` plus `/aras-api/*`, completely replacing the built-in Web UI on `dsh web`.
2. **Standalone HTTP listener (`ctx.webServer` absent)**: mounts its own `node:http` server (supporting `127.0.0.1` or `0.0.0.0` container preview binds) over `dsh --profile headless`.

## Table of Contents

- [Features](#features)
- [Overriding the Default `dsh web` UI](#overriding-the-default-dsh-web-ui)
- [Standalone / Container Preview Launch (`0.0.0.0`)](#standalone--container-preview-launch-0000)
- [HTTP & SSE API Surface](#http--sse-api-surface)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="features"></a>
## Features

- **Aras RTL Shell (`دستیار هوشمند ارس`)**:
  - Top bar with right-aligned sidebar toggle, centered Persian title, and left-aligned vector `RS` emblem.
  - Right navigation drawer (`پیشخوان`, `گفتگوی جدید`, `گفتگوها`, `اسناد`, `پایگاه‌های داده`, `سوالات متداول`, `تنظیمات سامانه`, `آپلودر`, `خروج`) and bottom theme switcher (`روشن` | `خودکار` | `تاریک`).
  - Welcome state (`خوش آمدید!`) with 5-pill routing bar where **خودکار (Auto)** is active and delegates routing to the Harness orchestrator (`عمومی`, `اسناد`, `اعداد`, and `وب` are intentionally locked).
  - Pill composer with image attachment (`+`), live Persian numeral character counter (`۰ / ۱۰,۰۰۰ کاراکتر`), `Enter` to send / `Shift+Enter` for newline, active-turn stop button, and `خروجی PDF` print export.
- **Live Harness Streaming & Interactive Cards**:
  - Real-time Server-Sent Events (`/aras-api/stream`) streaming text deltas, collapsible RTL reasoning (`فرآیند تفکر و استدلال مدل`) blocks, and collapsible RTL tool call/output (`اجرای ابزار`) cards.
  - Interactive RTL permission cards for `approval/request` (`تایید و اجرا` / `رد درخواست`) and structured multi-choice / free-text forms for `user-questions/request` (`ask_user_question`).
- **System Settings (`تنظیمات سامانه`)**:
  - Select default and active-session `providerId / modelId` across all registered LLM adapters (`deepseek-official`, `openai`, `anthropic`, `google`, custom OpenAI-compatible gateways, etc.).
  - Store or clear API keys in the Harness `secretStore` (`DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, etc.).
  - Configure custom DeepSeek `baseUrl`, add/delete custom OpenAI-compatible providers (`llmPiAi.providers`), and tune `permissions.defaultApproval`, `reasoningEffort`, and `thinkingBudgetTokens`.

<a id="overriding-the-default-dsh-web-ui"></a>
## Overriding the Default `dsh web` UI

In `packages/bundle/web-app/cordis.patch.yml`, `dsh web` mounts `id: webserver` (`@deepseek-ai/dsh-host-webserver`) and `id: web-runtime` (`@deepseek-ai/dsh-web-app`), where `web-runtime` claims the single `ctx.webServer.registerFallback(...)` seat for the built-in React frontend.

To replace the default Web UI with **دستیار هوشمند ارس**, disable `web-runtime` (and `harness-dev-context`, which injects `webApp`) and add `@deepseek-ai/dsh-aras-ui`.

### 1. Source checkout one-command override

From the repository root:

```bash
pnpm dsh web --patch packages/experimental/aras-ui/override-web.source.patch.yml
```

On Windows (`cmd.exe` / Explorer), you can also run [`start-server.cmd`](../../../start-server.cmd) from the repository root to verify Node.js (`>= 24.9.0`), `pnpm`, workspace dependencies, `@earendil-works/pi-ai` provider SDK integrity (`openai`, `@anthropic-ai/sdk`, `@google/genai` inside `node_modules/.pnpm`, auto-repairing partial Windows installs), and persistent `NODE_COMPILE_CACHE` bytecode/transpilation caching automatically, and choose between **`aras`** and **`dsh`**:

```bat
rem Full setup & verification launcher:
start-server.cmd
start-server.cmd aras --port 3080
start-server.cmd dsh --port 3080

rem Instant launcher (skips all Node/pnpm/package checks and starts Aras UI immediately):
start-server-fast.cmd
start-server-fast.cmd dsh --port 3080
```

`override-web.source.patch.yml`, `standalone.source.patch.yml`, and `cordis.patch.yml` also disable `hmr`, the Typert browser RPC stack, and the 70+ built-in React client UI plugins unused by Aras UI so source-mode startup avoids transpiling unused frontend packages while keeping all Harness core services, presets, orchestrator, and tools active.

You can still pass standard `dsh web` flags such as `--port 3090` or `--no-open`:

```bash
pnpm dsh web --patch packages/experimental/aras-ui/override-web.source.patch.yml --port 3090 --no-open
```

### 2. Permanent override via `~/.dsh/config.patch.yml` (or `.dsh/config.patch.yml`)

To make `dsh web` **always** boot into the Aras UI without passing `--patch` on every run, merge the contents of `cordis.patch.yml` (built package) or `override-web.source.patch.yml` (source checkout) into `~/.dsh/config.patch.yml`:

```yaml
- id: web-runtime
  disabled: true

- id: harness-dev-context
  disabled: true

- id: modules
  disabled: true

- id: client-hmr
  disabled: true

- insert:
    - id: aras-ui
      name: '@deepseek-ai/dsh-aras-ui'
      config:
        attachWebServer: true
        printUrl: true
```

<a id="standalone--container-preview-launch-0000"></a>
## Standalone / Container Preview Launch (`0.0.0.0`)

`@deepseek-ai/dsh-host-webserver` intentionally rejects `0.0.0.0` wildcard binds. When running inside a cloud sandbox or container preview environment that requires binding `0.0.0.0:<port>`, launch `dsh web` with `standalone.source.patch.yml` (which disables `webserver` + `web-runtime` and binds `@deepseek-ai/dsh-aras-ui`'s own `node:http` server on `0.0.0.0:3080`):

```bash
pnpm dsh web --patch packages/experimental/aras-ui/standalone.source.patch.yml --no-open
```

<a id="http--sse-api-surface"></a>
## HTTP & SSE API Surface

All endpoints live under `/aras-api`:

- `GET /aras-api/stream` — SSE stream emitting `session/updated`, `stream/start`, `stream/chunk`, `stream/end`, `approval/pending`, `approval/resolved`, `question/pending`, `question/resolved`, and `settings/updated`.
- `GET /aras-api/sessions` — List recorded Harness sessions in the current workspace.
- `GET /aras-api/sessions/:id` — Load projected RTL conversation history, pending approvals, and pending user questions.
- `POST /aras-api/sessions/prompt` — Create or resume an `Agent` with the `default` orchestrator preset and submit text + optional images.
- `POST /aras-api/sessions/:id/cancel` — Cancel the active turn (`agent.cancel('user')`).
- `POST /aras-api/approvals/:id` — Resolve a tool approval waterfall (`allowed-once`, `rejected`, or `cancelled`).
- `POST /aras-api/questions/:id` — Submit structured answers or cancel an `ask_user_question` prompt.
- `GET /aras-api/settings` — Read active/default model selection, catalog models, credential statuses, custom providers, and agent preferences.
- `POST /aras-api/settings/{model,credentials,providers/deepseek,providers/custom,preferences}` and `DELETE /aras-api/settings/providers/custom/:id` — Persist settings and credentials immediately.

<a id="model-experience"></a>
## Model Experience

`@deepseek-ai/dsh-aras-ui` does not inject any extra system prompt, tool definition, or hidden context block into the model's context window. Every user turn submitted from the Aras UI creates a standard `UserMessage` (`source: { kind: 'user' }`) on a Harness `Agent` mounted with the standard `default` agent preset, so prompt caching, compaction, tool schemas, and orchestrator subagent behavior are identical to the built-in CLI and Web surfaces.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **Static secondary navigation screens** — `پیشخوان`, `اسناد`, `پایگاه‌های داده`, `سوالات متداول`, and `آپلودر` intentionally render static RTL placeholders until connected to an external Aras organization backend.
- **Single-auto-mode routing** — Non-auto pills (`عمومی`, `اسناد`, `اعداد`, `وب`) are visually present to match the Aras design system and disabled so all prompts route through the Harness orchestrator (`خودکار`).
- **No built-in HTTP authentication layer** — When bound to a non-loopback interface in standalone mode, upstream network access control or reverse-proxy authentication must guard `/aras-api/*`.
