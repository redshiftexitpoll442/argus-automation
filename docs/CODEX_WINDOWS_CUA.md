# Argus Codex Windows Computer Use

Argus now has a Codex-specific MCP entry point:

```bash
npm run build
node dist/server-codex-mcp.js
```

This mode is intentionally separate from the Claude Code entry point:

```bash
node dist/server-mcp.js
```

`server-codex-mcp.js` does not call the OpenAI API, does not import the OpenAI
SDK, and does not require `OPENAI_API_KEY`. Codex invokes it as a local MCP
server, so model usage is charged to the active Codex session rather than to a
user-supplied API key.

## Codex MCP config

Add a local STDIO MCP server in Codex:

```toml
[mcp_servers.argus-codex]
command = "node"
args = ["D:\\claude-d\\gui-automation\\argus-automation\\dist\\server-codex-mcp.js"]
cwd = "D:\\claude-d\\gui-automation\\argus-automation"
tool_timeout_sec = 120
```

The original Claude-compatible server remains:

```toml
[mcp_servers.argus]
command = "node"
args = ["D:\\claude-d\\gui-automation\\argus-automation\\dist\\server-mcp.js"]
cwd = "D:\\claude-d\\gui-automation\\argus-automation"
tool_timeout_sec = 120
```

Do not point Claude Code at `server-codex-mcp.js` unless you explicitly want
the reduced Codex action-style tool surface.

## Codex plugin package

This repo also includes a local plugin wrapper at:

```text
plugins/argus-codex-computer-use
```

The plugin manifest points to `./.mcp.json`, which starts the same
`dist/server-codex-mcp.js` server from the repo root. This is packaging only;
the runtime path is still local MCP, not an OpenAI API call.

## Tool flow

Use these tools in order:

1. `computer_status` checks the server and confirms it is using local MCP, not
   an OpenAI API key.
2. `computer_open_application` opens or activates an app and authorizes it for
   the session.
3. `computer_observe` captures the screen. It returns an MCP image block, a
   local screenshot file path, and coordinate metadata.
4. `computer_execute` runs GPT-style actions: `click`, `double_click`, `scroll`,
   `type`, `keypress`, `drag`, `move`, `wait`, and `screenshot`.

Coordinates default to `image` space, meaning the x/y values are pixels in the
last `computer_observe` screenshot. Argus maps those image coordinates to
Windows display coordinates before executing input. You can pass
`coordinateSpace: "display"` when you already have absolute display
coordinates.

## Example

```json
{
  "actions": [
    { "type": "click", "x": 420, "y": 180 },
    { "type": "type", "text": "hello from Codex" },
    { "type": "keypress", "keys": ["CTRL", "A"] }
  ],
  "screenshotAfter": true
}
```

## Safety notes

The Codex entry point uses a simpler permission model than the Claude Code UI
integration. It requires apps to be authorized through `computer_open_application`
or `computer_authorize` before sending input, but it cannot show a native Codex
permission dialog from inside MCP. Keep tasks scoped to the intended app.

Windows screenshots are not compositor-filtered, so visible windows may appear
in screenshots even if they are not authorized for input.
