# Apple MCP tools

[![smithery badge](https://smithery.ai/badge/@Dhravya/apple-mcp)](https://smithery.ai/server/@Dhravya/apple-mcp)

This is a collection of apple-native tools for the [MCP protocol](https://modelcontextprotocol.com/docs/mcp-protocol).

Here's a step-by-step video about how to set this up, with a demo. - https://x.com/DhravyaShah/status/1892694077679763671

<a href="https://glama.ai/mcp/servers/gq2qg6kxtu">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/gq2qg6kxtu/badge" alt="Apple Server MCP server" />
</a>

![image](https://github.com/user-attachments/assets/56a5ccfa-cb1a-4226-80c5-6cc794cefc34)


<details>
<summary>Here's the JSON to copy</summary>

```
{
  "mcpServers": {
    "apple-mcp": {
      "command": "bunx",
      "args": ["--no-cache", "apple-mcp@latest"]
    }
  }
}

```

</details>

#### Quick install

To install Apple MCP for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@Dhravya/apple-mcp):

```bash
npx -y @smithery/cli@latest install @Dhravya/apple-mcp --client claude
```

... and for cursor, you can do:

```bash
npx -y @smithery/cli@latest install @Dhravya/apple-mcp --client cursor
```


## Features

- Messages:
  - Send messages using the Apple Messages app
  - Read out messages
- Notes:
  - List notes (optionally scoped by account and folder)
  - Search & read notes in Apple Notes app (optionally scoped)
  - Create notes in a specific folder, optionally targeting an account
  - List Apple Notes accounts and folders
- Contacts:
  - Search contacts for sending messages
- Emails:
  - Send emails with multiple recipients (to, cc, bcc) and file attachments
  - Search emails with custom queries, mailbox selection, and result limits
  - Schedule emails for future delivery
  - List and manage scheduled emails
  - Check unread email counts globally or per mailbox
  - List configured accounts with type and status
  - Retrieve detailed account settings
  - Display mailbox hierarchy and properties
  - List messages from a specific mailbox with filters
  - Retrieve attachments and full message headers when listing messages
  - Move messages into existing mailboxes
- Reminders:
  - List all reminders and reminder lists
  - Search for reminders by text
  - Create new reminders with optional due dates and notes
  - Open the Reminders app to view specific reminders
- Calendar:
  - Search calendar events with customizable date ranges
  - List upcoming events
  - Create new calendar events with details like title, location, and notes
  - Open calendar events in the Calendar app
- Web Search:
  - Search the web using DuckDuckGo
  - Retrieve and process content from search results
- Maps:
  - Search for locations and addresses
  - Save locations to favorites
  - Get directions between locations
  - Drop pins on the map
  - Create and list guides
  - Add places to guides
- Photos:
  - Search photos by name
  - Open a specific photo
- Music:
  - Search library songs
  - Play a specific song


You can also daisy-chain commands to create a workflow. Like:
"can you please read the note about people i met in the conference, find their contacts and emails, and send them a message saying thank you for the time."

(it works!)


#### Manual installation

You just need bun, install with `brew install oven-sh/bun/bun`

Now, edit your `claude_desktop_config.json` with this:

```claude_desktop_config.json
{
  "mcpServers": {
    "apple-mcp": {
      "command": "bunx",
      "args": ["@dhravya/apple-mcp@latest"]
    }
  }
}
```

### Usage

Now, ask Claude to use the `apple-mcp` tool.

```
Can you send a message to John Doe?
```

```
find all the notes related to AI and send it to my girlfriend
```

```
create a reminder to "Buy groceries" for tomorrow at 5pm
```

Structural mailbox changes such as creating, deleting, renaming, or moving
folders are intentionally not exposed through Apple Mail Automation. Create or
manage folders manually in Mail or through a robust server-side mail API.

## Local Development

```bash
git clone https://github.com/dhravya/apple-mcp.git
cd apple-mcp
bun install
bun run lint
bun test
bun run index.ts
```

Use `bun run index.ts` for development. For a stable local MCP runtime, build the
TypeScript output and run the compiled Node entry point:

```bash
bun run build
node dist/index.js
```

Local MCP clients should point at `dist/index.js` for the stable runtime:

```json
{
  "mcpServers": {
    "apple-mcp": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/path/to/apple-mcp/dist/index.js"]
    }
  }
}
```

Do not use or recreate `build/index.js`; it was a stale local bundle that started
but failed Apple Mail account retrieval.

enjoy!
