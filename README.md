# ZenArc MCP

> AI-native task management for Claude Code via the Model Context Protocol.

ZenArc replaces scattered `TODO.md` files with structured, agent-friendly YAML task files. This package provides the **MCP server** that lets Claude Code create, update, search, and manage tasks across all your projects — directly from the terminal.

## Install

```bash
npm install -g zenarc-mcp
```

Requires Node.js ≥ 20.

## Claude Code Setup

Add to your Claude Code settings (`~/.claude/settings.json` or a project's `.claude/settings.local.json`):

```json
{
  "mcpServers": {
    "zenarc": {
      "command": "zenarc-mcp"
    }
  }
}
```

Restart Claude Code. That's it — no API keys, no ports, no server to run. `zenarc-mcp` auto-initializes on first use.

## First Run

Ask Claude to scan your projects:

> *"Scan my projects in ~/dev"*

Then use natural language for everything:

> *"List my critical tasks for loa-web"*
>
> *"Mark the GA4 tracking task as done"*
>
> *"Create a new high-priority task in codeyourreality to update the hero copy"*
>
> *"Search for anything related to SEO across all projects"*

## MCP Tools

| Tool | Description |
|------|-------------|
| `zenarc_scan` | Discover projects and add them to the registry |
| `zenarc_list` | List tasks with filters (status, priority, project, tag, assignee) |
| `zenarc_get` | Get full task details by ID |
| `zenarc_create` | Create a new task with structured metadata |
| `zenarc_update` | Update task fields (status, priority, assignee, notes) |
| `zenarc_search` | Keyword search across titles, tags, and notes |
| `zenarc_context_add` | Link file paths or URLs to an existing task |

## Task File Format

Each task is a standalone YAML file in `{project}/.zenarc/tasks/`:

```yaml
id: tm-20260602-a1b2c3d4
title: Fix GA4 '(not set)' page tracking
status: in_progress
priority: critical
project: loa-web
tags: [analytics, seo, bugfix]
created_at: "2026-05-10T09:00:00Z"
updated_at: "2026-05-18T14:30:00Z"
created_by: human
assigned_to: claude
context:
  files:
    - app/components/PageViewTracker.jsx
    - app/ClientLayout.js
  urls:
    - https://analytics.google.com/analytics/web/
  notes: >
    Fires manual page_view on App Router client-side navigations
    with 100ms delay for document.title to settle.
dependencies: []
```

## Project Registry

Projects are tracked in `~/.zenarc/projects.json`:

```json
[
  { "name": "loa-web", "path": "/Users/.../loa/loa-web", "format": "yaml" }
]
```

The registry is auto-populated during `zenarc_scan`.

## Optional: Firebase Cloud Sync

Set `FIREBASE_SYNC_ENABLED=true` and `GOOGLE_APPLICATION_CREDENTIALS` to enable bidirectional sync with Firestore for multi-device access. Without these, ZenArc works fully offline with local YAML files.

## Migration from TODO.md

Convert a project's `TODO.md` into structured YAML tasks:

```bash
zenarc-migrate my-project /path/to/my-project
```

## Architecture

```
zenarc-mcp/
├── src/
│   ├── server.ts          # MCP server (stdio transport)
│   ├── store-init.ts      # Store initialization (local + optional Firebase)
│   ├── core/              # Task schema, YAML store, registry
│   └── sync/              # Optional Firebase Firestore sync layer
```

- **Local-first**: Tasks are YAML files in each project's `.zenarc/tasks/` directory.
- **Git-native**: Tasks version alongside code. Review task changes in PRs.
- **MCP is local-only**: Uses stdio transport. No HTTP/SSE/remote endpoint.

## Development

```bash
npm install
npm run build    # Compile TypeScript to dist/
npm run dev      # Watch mode
npm start        # Run the MCP server
```

## Tech Stack

- TypeScript, Zod (schema validation), YAML (serialization)
- `@modelcontextprotocol/sdk` (stdio transport)
- `firebase-admin` (optional sync layer)

## License

MIT
