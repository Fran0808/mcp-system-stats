# Connect system-stats to a compatible agent

This skill uses https://github.com/Fran0808/mcp-system-stats. It requires an agent that can load the instructions and call the server through a local **stdio** MCP connection. Agensi supplies the skill, not access to the user's hardware. A cloud-only assistant without a local bridge cannot inspect the user's computer through this server.

The npm package supplies the server; the client's MCP configuration starts it; this skill supplies diagnostic instructions. Installing one does not automatically configure the others. The client launches the server, so you do not need to start it in another terminal.

## 1. Requirements

- Node.js 22.14+ on the 22.x line, 24.x, or 26+. The current package does not support Node 20, 23, or 25.
- Check `node --version` and `npm --version`. The client must inherit the executable PATH; restart it after Node/npm installation.
- Network access to npm for installation or an uncached npx launch. No API key is required for the basic server.
- Missing sensors can reflect OS, drivers, permissions or hardware. Do not require administrator access or extra sensor software just to eliminate an unavailable reading.

The examples pin `@fran0808/system-stats@2.0.1`. Review compatibility before changing versions. In WSL, containers, SSH sessions or remote workspaces, readings describe the environment where the server runs, which may differ from the user's physical PC.

## 2. Install independently of the agent

Install once, or skip if this version is already installed globally:

```bash
npm install -g @fran0808/system-stats@2.0.1
```

This supplies the `system-stats` executable. It does not register an MCP connection or install the skill. If npm reports a global-install permissions error, use a user-owned Node/npm installation rather than assuming elevation is required.

## 3. Generic manual MCP connection

Create one server named `system-stats` in the client's manual MCP configuration:

| Setting | macOS/Linux | Native Windows |
|---|---|---|
| Transport | `stdio` | `stdio` |
| Command | `system-stats` | `cmd.exe` |
| Arguments | None | `["/d", "/c", "system-stats"]` |
| Credentials | None | None |

The Windows wrapper runs npm's executable shim. File location and JSON/TOML syntax depend on the client. Merge with existing settings; preserve other servers and update an existing entry instead of duplicating its name. These are process launch values, not a remote HTTP URL. Use an actual executable path if the client's PATH differs from your terminal.

### Alternative: npx without global installation

On macOS/Linux, use `command: npx` and `args: ["-y", "@fran0808/system-stats@2.0.1"]`. On native Windows, use `command: cmd.exe` with `args: ["/d", "/c", "npx", "-y", "@fran0808/system-stats@2.0.1"]`.

The [macOS/Linux JSON template](../assets/mcp-config.json) and [Windows JSON template](../assets/mcp-config.windows.json) use this npx alternative. It downloads the pinned package if necessary and starts it from npm's cache; `-y` accepts npm's execution confirmation. It requires npm network access when uncached, but not `npm install -g`. Choose either npx or the installed executable for one entry. A template inside the skill does not register a server automatically.

## 4. Optional examples by client

These are separate clients with different configuration systems. The skill itself does not depend on any one of them. Configuration examples do not mean every client has been tested end to end.

### Cursor

Use project `.cursor/mcp.json` or user-level `~/.cursor/mcp.json`. After global npm installation, a native Windows entry is:

```json
{
  "mcpServers": {
    "system-stats": {
      "command": "cmd.exe",
      "args": ["/d", "/c", "system-stats"]
    }
  }
}
```

On macOS/Linux use `"command": "system-stats"` and omit `args`. For npx substitute the alternative launch values above. Reconnect as required by the client, then run the common verification below.

### Claude Desktop: desktop chat's local MCP configuration

Claude Desktop uses `claude_desktop_config.json` for this local MCP setup:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`.
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`.

Merge a `mcpServers` entry using the same JSON shape as Cursor and the launch values for your OS. Fully quit and reopen Desktop and verify a real tool call. This concerns local desktop chat, not browser-only Claude or the separate Claude Code runtime. Different tabs/runtimes in one application may use different configuration.

### Claude Code: coding-agent configuration

Claude Code is a different client/runtime, available through CLI and development interfaces. Configuring a local stdio server in Claude Desktop does not automatically register it with Claude Code.

For manual project configuration, use `.mcp.json` at the project root. The native Windows entry after global npm installation is:

```json
{
  "mcpServers": {
    "system-stats": {
      "type": "stdio",
      "command": "cmd.exe",
      "args": ["/d", "/c", "system-stats"]
    }
  }
}
```

On macOS/Linux use `"command": "system-stats"` and omit `args`. Claude Code can ask for approval before using a project-scoped server in an interactive session.

Alternatively, register through the CLI at user scope (available across projects). Native Windows:

```powershell
claude mcp add --transport stdio --scope user system-stats -- cmd.exe /d /c system-stats
claude mcp list
```

macOS/Linux:

```bash
claude mcp add --transport stdio --scope user system-stats -- system-stats
claude mcp list
```

The CLI manages its own configuration; user-scoped entries are in `~/.claude.json`, not Desktop's file. Choose manual configuration or CLI registration, not both for the same server. Restart/reconnect as required, inspect `/mcp` inside Claude Code and verify a tool call. If Code runs in WSL, use Linux launch values with an installation in that environment.

### Codex: local client configuration

Codex uses TOML, normally `~/.codex/config.toml` for user settings. After global npm installation, merge this native Windows table:

```toml
[mcp_servers.system-stats]
command = "cmd.exe"
args = ["/d", "/c", "system-stats"]
startup_timeout_sec = 60
tool_timeout_sec = 60
```

On macOS/Linux use `command = "system-stats"` and omit `args`. For npx substitute the alternative launch values. Edit an existing table rather than adding a duplicate.

Alternatively, if Codex CLI is available, register instead of editing TOML. Native Windows:

```powershell
codex mcp add system-stats -- cmd.exe /d /c system-stats
codex mcp list
```

macOS/Linux:

```bash
codex mcp add system-stats -- system-stats
codex mcp list
```

If the terminal does not recognize `codex`, use manual configuration. Restart the local client and verify a tool call. `/mcp` shows active servers in Codex CLI. Local configuration does not register a connector in a cloud-only chat.

## 5. Common verification and troubleshooting

1. Confirm the client reports `system-stats` connected and exposes `get_memory_status` and `get_system_health`. A saved entry or CLI listing does not by itself prove a successful connection.
2. Ask: "Use the system-stats MCP to show my current RAM usage in GB." Verify a real `get_memory_status` call with `{"unit":"GB"}` succeeds and returns structured data.
3. With the skill loaded, ask: "My PC is slow. Compare several samples and explain the limits." Expect `get_performance_diagnostics` and an explanation of unavailable data. Do not substitute example numbers for live telemetry.

If the installed command is missing, check the npm executable PATH in the client's environment and restart after installation. On Windows, `where.exe system-stats` shows the executable location; `npm prefix -g` shows the prefix. Configure an actual installation path if necessary. For npx, also check npm network access and startup time; the Codex example allows 60 seconds.

Inspect the actual error. `UNSUPPORTED_PLATFORM` is a supported contract, not a reason to retry indefinitely. A terminal waiting after manually starting the server is expected because stdio waits for protocol messages; the client normally starts it for you.

For a developer checkout, another launch option is `node` with an absolute path to `build/index.js` after `npm ci` and `npm run build`. That tests a source build rather than the published npm installation.

## 6. Load the skill separately

For GitHub distribution, install the complete skill folder in the client's documented skill location. For Agensi, load the listing through its supported connection. Both routes still require the local MCP connection. Confirm supporting references/templates are accessible through the chosen route; do not assume Agensi writes the folder to disk or every agent uses the same skill installation method.

## Official references

- [Cursor MCP configuration](https://cursor.com/docs/mcp)
- [Claude Desktop local servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
- [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp)
- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [system-stats source and release notes](https://github.com/Fran0808/mcp-system-stats)
