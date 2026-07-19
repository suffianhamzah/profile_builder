---
name: web-browser
description: "Allows to interact with web pages by performing actions such as clicking buttons, filling out forms, and navigating links. It works by remote controlling Google Chrome or Chromium browsers using the Chrome DevTools Protocol (CDP). When Claude needs to browse the web, it can use this skill to do so."
license: Stolen from Mario
---

# Web Browser Skill

Minimal CDP tools for collaborative site exploration.

From the Atlas repository root, run `make browser-setup` once. The Makefile targets below invoke the vendored scripts with the active Node.js runtime, so the scripts do not need executable permissions.

## Start Chrome

```bash
make browser-start                                      # Fresh profile
node .agents/skills/web-browser/scripts/start.js --profile # Copy your profile
```

Start Chrome on `:9222` with remote debugging.

## Navigate

```bash
make browser-open APP_URL=https://example.com
node .agents/skills/web-browser/scripts/nav.js https://example.com --new
```

Navigate current tab or open new tab.

## Evaluate JavaScript

```bash
node .agents/skills/web-browser/scripts/eval.js 'document.title'
node .agents/skills/web-browser/scripts/eval.js 'document.querySelectorAll("a").length'
node .agents/skills/web-browser/scripts/eval.js 'JSON.stringify(Array.from(document.querySelectorAll("a")).map(a => ({ text: a.textContent.trim(), href: a.href })).filter(link => !link.href.startsWith("https://")))'
```

Execute JavaScript in active tab (async context).  Be careful with string escaping, best to use single quotes.

## Screenshot

```bash
node .agents/skills/web-browser/scripts/screenshot.js
```

Screenshot current viewport, returns temp file path

## Pick Elements

```bash
node .agents/skills/web-browser/scripts/pick.js "Click the submit button"
```

Interactive element picker. Click to select, Cmd/Ctrl+Click for multi-select, Enter to finish.

## Dismiss Cookie Dialogs

```bash
node .agents/skills/web-browser/scripts/dismiss-cookies.js          # Accept cookies
node .agents/skills/web-browser/scripts/dismiss-cookies.js --reject # Reject cookies
```

Automatically dismisses EU cookie consent dialogs.

Run after navigating to a page:
```bash
node .agents/skills/web-browser/scripts/nav.js https://example.com
node .agents/skills/web-browser/scripts/dismiss-cookies.js
```

## Background Logging (Console + Errors + Network)

Automatically started by `start.js` and writes JSONL logs to:

```
~/.cache/agent-web/logs/YYYY-MM-DD/<targetId>.jsonl
```

Manually start:
```bash
node .agents/skills/web-browser/scripts/watch.js
```

Tail latest log:
```bash
make browser-logs
node .agents/skills/web-browser/scripts/logs-tail.js --follow
```

Summarize network responses:
```bash
make browser-network
```
