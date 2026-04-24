---
name: argus-codex-computer-use
description: Use Argus from Codex on Windows to observe and operate desktop applications through the local MCP server without requiring an OpenAI API key.
---

# Argus Codex Computer Use

Use the `argus-codex` MCP server, not the Claude-compatible `argus` MCP server,
when operating Windows desktop applications from Codex.

This server is local-only. It does not call the OpenAI API and does not need
`OPENAI_API_KEY`; usage is billed through the active Codex session.

## Workflow

1. Call `computer_status` to verify the server is running and check displays.
2. Call `computer_open_application` for the target app, for example
   `{"app":"EXCEL.EXE"}` or `{"app":"notepad.exe"}`.
3. Call `computer_observe` before coordinate-based actions.
4. Call `computer_execute` with GPT-style actions.

Coordinates default to image-space pixels from the last `computer_observe`
screenshot. Use `coordinateSpace: "display"` only when you already know absolute
display coordinates.

## Actions

`computer_execute` supports:

- `click`: `{ "type": "click", "x": 100, "y": 200, "button": "left" }`
- `double_click`: `{ "type": "double_click", "x": 100, "y": 200 }`
- `scroll`: `{ "type": "scroll", "x": 100, "y": 200, "dy": 3 }`
- `type`: `{ "type": "type", "text": "hello" }`
- `keypress`: `{ "type": "keypress", "keys": ["CTRL", "V"] }`
- `drag`: `{ "type": "drag", "from": { "x": 100, "y": 200 }, "to": { "x": 300, "y": 200 } }`
- `move`: `{ "type": "move", "x": 100, "y": 200 }`
- `wait`: `{ "type": "wait", "seconds": 1 }`
- `screenshot`: `{ "type": "screenshot" }`

For Chinese or other non-ASCII text, prefer the `type` action. Argus will use a
clipboard paste path internally when needed.

