# Connect the local system-stats server

This skill uses the open-source MCP server at https://github.com/Fran0808/mcp-system-stats. It needs a client capable of starting a local stdio MCP server on the computer you want to inspect. Agensi supplies the skill instructions; it does not supply access to that computer's hardware.

## Requirements

- Node.js 22.14 or later on the 22.x line, 24.x, or 26+. The current package does not support Node 20, 23, or 25.
- `node` and `npx` available to the client process. Check `node --version` and `npx --version` in a terminal. Restart the client after installing Node so it inherits the updated PATH.
- Network access to npm on the first `npx` launch if the package is not cached. `npx -y` downloads and executes the named package without its install confirmation. It is not an offline operation or a global installation.
- No API key or administrator account is required for the basic server. Some sensors may be unavailable because of OS, drivers, permissions, or hardware. Do not elevate privileges just to eliminate a missing-data message.

The templates pin `@fran0808/system-stats@2.0.1`, matching this skill's documented baseline. Before using a different release, check its compatibility and release notes. A published npm install still needs verification on a fresh client; a local source build does not prove registry availability.

## Cursor and clients accepting mcpServers JSON

Use [the macOS/Linux template](../assets/mcp-config.json) or [the Windows template](../assets/mcp-config.windows.json). These files are examples to merge into the client's configuration; placing a JSON file in a skill folder does not register a server.

For Cursor, use a project's `.cursor/mcp.json` or the user-level `~/.cursor/mcp.json`. Merge the `system-stats` entry into the existing `mcpServers` object instead of replacing other servers. The same JSON shape is documented for Claude Desktop's `claude_desktop_config.json`; its usual Windows location is `%APPDATA%\Claude\claude_desktop_config.json`, and macOS location is `~/Library/Application Support/Claude/claude_desktop_config.json`.

The macOS/Linux entry is:

```json
{
  "mcpServers": {
    "system-stats": {
      "command": "npx",
      "args": ["-y", "@fran0808/system-stats@2.0.1"]
    }
  }
}
```

On Windows, the template uses `cmd.exe` with `args: ["/d", "/c", "npx", "-y", "@fran0808/system-stats@2.0.1"]` so the npm command shim can run. This launches a fixed package command, not user-provided shell text. A client that cannot find Node/npm should use an explicitly configured installation path appropriate to that machine.

## Codex local clients

Codex uses TOML rather than the JSON object above. On macOS/Linux, merge this table into the client's `config.toml`:

```toml
[mcp_servers.system-stats]
command = "npx"
args = ["-y", "@fran0808/system-stats@2.0.1"]
startup_timeout_sec = 60
tool_timeout_sec = 60
```

On Windows, replace the command and args with:

```toml
command = "cmd.exe"
args = ["/d", "/c", "npx", "-y", "@fran0808/system-stats@2.0.1"]
```

Keep these lines under the existing `[mcp_servers.system-stats]` table; do not add a duplicate table. First-launch downloads can need longer than the default startup timeout. Restart or reconnect as required by the client, then inspect its MCP status. In Codex CLI, `codex mcp list` lists configured servers and `/mcp` shows active servers in the TUI. Configuration is not proof that the handshake succeeded.

## Verify the connection

1. Confirm the client reports `system-stats` connected and exposes tools such as `get_memory_status` and `get_system_health`.
2. Ask: "Use system-stats to show my current RAM usage in GB." Verify a real call to `get_memory_status` with `{"unit":"GB"}` returns a successful structured result. Do not mistake example output for telemetry.
3. Ask: "My PC is slow. Compare several samples and explain the limits." The assistant should call `get_performance_diagnostics` and label unavailable data.

If a tool fails, inspect its actual error. A missing `npx` is a startup/PATH problem; `UNSUPPORTED_PLATFORM` is a supported error contract, not a reason to retry indefinitely. A terminal waiting after starting the server is expected: stdio awaits protocol messages rather than printing a report.

For a developer source checkout, an alternative connection is `command: node` with an absolute path to that checkout's `build/index.js` after `npm ci` and `npm run build`. Use the actual path on the user's machine; this source-build option does not test the npm distribution.

## Load the skill separately

For a direct GitHub distribution, install the complete `system-stats` skill folder in the client's documented skill location. For Agensi, load the listing through its supported connection. Either route still requires the local server configured above. Confirm supporting references and templates are accessible through the chosen delivery route; do not assume that Agensi writes a skill directory to disk.

## Documentation sources

- [Cursor MCP configuration](https://cursor.com/docs/mcp)
- [Local servers and Claude Desktop](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [system-stats source and release notes](https://github.com/Fran0808/mcp-system-stats)
