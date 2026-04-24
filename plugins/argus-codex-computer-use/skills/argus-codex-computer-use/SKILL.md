---
name: argus-codex-computer-use
description: Use Argus from Codex to observe and operate Windows desktop applications through a local MCP server.
---

# Argus Codex Computer Use

Use the `argus-codex` MCP server for Windows desktop automation from Codex.
This server is local-only: it does not call the OpenAI API and does not require
`OPENAI_API_KEY`.

## Standard Flow

1. Call `computer_status` to verify the local server is available.
2. Call `computer_open_application` for the target app, such as
   `{"app":"EXCEL.EXE"}` or `{"app":"c:\\program files\\tencent\\weixin\\weixin.exe"}`.
3. Call `computer_observe` before coordinate-based actions.
4. Call `computer_execute` with action objects.

Coordinates default to image-space pixels from the last `computer_observe`
screenshot. Pass `coordinateSpace: "display"` only for absolute display
coordinates.

## Actions

- `click`: `{ "type": "click", "x": 100, "y": 200 }`
- `double_click`: `{ "type": "double_click", "x": 100, "y": 200 }`
- `scroll`: `{ "type": "scroll", "x": 100, "y": 200, "dy": 3 }`
- `type`: `{ "type": "type", "text": "hello" }`
- `keypress`: `{ "type": "keypress", "keys": ["CTRL", "V"] }`
- `drag`: `{ "type": "drag", "from": { "x": 100, "y": 200 }, "to": { "x": 300, "y": 200 } }`
- `move`: `{ "type": "move", "x": 100, "y": 200 }`
- `wait`: `{ "type": "wait", "seconds": 1 }`

For Chinese text, use the `type` action. Argus routes non-ASCII text through a
clipboard paste path internally.

