# MCP TapData Server
---

A Model Context Protocol server that provides access to TapData. This server enables LLMs to inspect
connections, schemas and execute CRUD operations.

## Features

### Resources

- List all available database connections
- List all tables based on database connection id

### Tools

- **connections**
    - Get available database connection information and status
    - Input: None
    - Returns id, connection type, connection name, database type, connection type and table count

- **tables**
    - List all tables based on database connection id
    - Input: Collection id
    - Returns id, table type, table name

- **query**
    - Query data using the specified database connection id and table name
    - Input: Connection id, table name options
    - Returns query results or execution plan

## Development

Install dependencies:

```bash
pnpm install
```

Build the server:

```bash
pnpm run build
```

For development with auto-rebuild:

```bash
pnpm run watch
```

## Installation for Development

### Using Claude Desktop

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcp-tap-server": {
      "url": "http://localhost:3001/sse?accessCode=3324cfdf-7d3e-4792-bd32-571638d4562f",
      "type": "sse"
    }
  }
}
```