# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# apple-mcp Development Guidelines

## Project Overview
Apple MCP is a Model Context Protocol server that provides AI assistants with programmatic access to native macOS applications including Messages, Mail, Contacts, Notes, Reminders, Calendar, Maps, Photos, Music, and web search capabilities.

## Project Overview
Apple MCP (Model Context Protocol) is a collection of native Apple tools that enables AI assistants to interact with macOS applications through the MCP protocol. It provides programmatic access to Messages, Mail, Contacts, Notes, Reminders, Calendar, Maps, Photos, Music, and web search capabilities.

## Commands
- `bun run dev` - Start the development server
- `bun run lint` - Check code style with ESLint
- `bun test` - Run the test suite
- `bun run index.ts` - Run the MCP server directly
- `bun run index.ts` - Run the MCP server directly

## Architecture

### Core Components
1. **MCP Server** (`index.ts`)
   - Uses `@modelcontextprotocol/sdk` with StdioServerTransport
   - Implements dual-mode module loading (eager with lazy fallback)
   - 5-second timeout for module initialization
   - Comprehensive request handling with type guards

2. **Tool Definitions** (`tools.ts`)
   - 10 tools: contacts, notes, messages, mail, reminders, webSearch, calendar, maps, photos, music
   - Each tool has detailed input schemas with operations
   - Consistent structure with name, description, and inputSchema

3. **Utility Modules** (`utils/`)
   - One module per Apple application
   - Mix of AppleScript and JXA implementations
   - Consistent default export pattern

### Module Loading Strategy
- Eager loading attempted at startup for performance
- Automatic fallback to lazy loading after 5 seconds
- Safe mode prevents startup failures from blocking server

## Code Style

### TypeScript Configuration
- Target: ESNext
- Module: ESNext
- Strict mode enabled
- Bundler module resolution
- Allows `.ts` imports in development

### Formatting & Structure
- Use 2-space indentation (based on existing code)
- Keep lines under 100 characters
- Use explicit type annotations for function parameters and returns
- Organize code by functionality (tools, utils, types)

### Naming Conventions
- PascalCase for types, interfaces and Tool constants (e.g., `CONTACTS_TOOL`)
- camelCase for variables and functions
- Use descriptive names that reflect purpose
- Prefix type guard functions with `is` (e.g., `isContactsArgs`)

### Imports
- Use ESM import syntax with `.js` extensions for runtime
- Organize imports: external packages first, then internal modules
- Use default exports for utility modules

### Error Handling
- Use try/catch blocks around applescript execution and external operations
- Return both success status and detailed error messages
- Check for required parameters before operations
- Implement permission checks (e.g., Contacts access)
- Graceful fallback for missing data

### Type Safety
- Define strong types for all function parameters 
- Use type guard functions for validating incoming arguments
- Provide detailed TypeScript interfaces for complex objects
- Leverage TypeScript's strict mode for compile-time safety

### MCP Tool Structure
- Follow established pattern for creating tool definitions
- Include detailed descriptions and proper input schema
- Organize related functionality into separate utility modules

## Architecture

### Module Structure
- `index.ts` - Main MCP server entry point with smart module loading
- `tools.ts` - Tool definitions and exports for all supported operations
- `utils/` - Individual utility modules for each Apple application
  - Each module exports functions that interact with macOS apps via AppleScript/JXA
  - Returns structured data with success status and error handling

### Module Loading Strategy
The server implements a dual-mode loading approach:
1. Attempts eager loading of all modules for optimal performance
2. Falls back to lazy loading after 5 seconds if modules take too long
3. Prevents individual module failures from blocking server startup

### AppleScript/JXA Integration
- Complex operations use AppleScript via `osascript`
- Simple operations use JXA (JavaScript for Automation)
- All scripts are wrapped in try/catch blocks with detailed error messages
- Permission checks (e.g., Contacts access) handled gracefully

### Testing Approach
- Unit tests for individual utility functions
- Mock AppleScript execution in tests
- Test files follow pattern: `tests/*.test.ts`
- Each tool should have:
  - Clear operation types (enum)
  - Required and optional parameters
  - Comprehensive descriptions

### AppleScript/JXA Guidelines
- Use AppleScript for complex macOS integrations
- Use JXA for simpler, JavaScript-like operations
- Always escape user inputs in AppleScript strings
- Handle AppleScript errors gracefully
- Test for app availability before operations

### Testing Approach
- Unit tests for utility functions
- Integration tests for tool operations
- Mock AppleScript/JXA calls where appropriate
- Test error scenarios and edge cases
