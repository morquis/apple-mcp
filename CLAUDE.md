# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# apple-mcp Development Guidelines

## Current Local Runtime Status

Before changing MCP launch configuration or build artifacts, read:

- `docs/llm-project-status.md`

As of 2026-05-02, `dist/index.js` and `bun run index.ts` are verified working entry
points. The former `build/index.js` artifact started but broke Apple Mail account
retrieval; it was removed and must not be recreated as an MCP entry point.

## Project Overview

Apple MCP is a Model Context Protocol server that gives AI assistants programmatic
access to native macOS applications: Messages, Mail, Contacts, Notes, Reminders,
Calendar, Maps, Photos, Music, and web search.

## Commands

- `bun run dev` - Start the development MCP server from `index.ts`.
- `bun run build` - Compile TypeScript to `dist/`.
- `bun run start` - Run the compiled server from `dist/index.js`.
- `bun run lint` - Check code style with ESLint.
- `bun test` - Run the unit test suite.
- `APPLE_MCP_INTEGRATION=1 bun test tests/integration/mail.integration.test.ts` -
  Run the Mail integration tests.

## Entry Points

- Development: `bun run index.ts` or `bun run dev`.
- Stable local runtime: `bun run build`, then `node dist/index.js`.
- Do not use or recreate `build/index.js`; it was a stale local bundle that failed
  the Mail `accounts` operation.

## Architecture

### Core Components

1. **MCP Server** (`index.ts`)
   - Uses `@modelcontextprotocol/sdk` with `StdioServerTransport`.
   - Implements dual-mode module loading: eager loading with lazy fallback.
   - Uses a 5-second timeout for module initialization.
   - Handles requests with type guards and per-tool validation.

2. **Tool Definitions** (`tools.ts`)
   - Defines 10 tools: contacts, notes, messages, mail, reminders, webSearch,
     calendar, maps, photos, and music.
   - Each tool has an input schema and operation-specific parameters.

3. **Utility Modules** (`utils/`)
   - One module per Apple application or service.
   - Uses AppleScript and JXA through shared execution helpers.
   - Exports structured functions consumed by `index.ts`.

4. **Shared JXA Bridge** (`core/jxa-bridge.ts`)
   - Wraps `osascript -l JavaScript` execution.
   - Normalizes JSON parsing, timeouts, and app-not-running errors.

## TypeScript Configuration

- Target: `ES2022`.
- Module: `NodeNext`.
- Module resolution: `NodeNext`.
- Output directory: `dist/`.
- Strict mode is enabled.
- Source imports use `.js` extensions so emitted Node ESM resolves correctly.

## Code Style

- Use 2-space indentation.
- Keep edits scoped to the relevant tool or utility module.
- Prefer explicit types for public function parameters and return values.
- Use PascalCase for interfaces and tool constants.
- Use camelCase for variables and functions.
- Prefix type guard functions with `is`.

## AppleScript/JXA Guidelines

- Escape user-controlled strings before embedding them in scripts.
- Use shared bridge helpers instead of ad hoc `osascript` spawning.
- Return structured data and preserve actionable error messages.
- Check app availability and permissions where the underlying app requires it.

## Testing

- Unit tests live next to utility modules or under `tests/`.
- Integration tests live under `tests/integration/` and require
  `APPLE_MCP_INTEGRATION=1`.
- For runtime changes, run an MCP smoke test against `dist/index.js`:
  `initialize`, `tools/list`, and `mail` with `operation: "accounts"`.
