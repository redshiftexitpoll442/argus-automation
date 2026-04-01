---
name: argus-gui-automation
description: |
  Desktop GUI automation via the Argus MCP server. Use when the user asks to
  control their computer, interact with desktop applications, take screenshots,
  click UI elements, type text, scroll, manage windows, or automate any GUI task.
  Triggers: "screenshot", "click on", "open app", "type into", "scroll",
  "computer use", "GUI automation", "desktop control", "操作电脑", "截屏",
  "点击", "打开应用", "输入文字".
display-name: Argus GUI Automation
version: 0.1.0
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - mcp__argus__request_access
  - mcp__argus__list_granted_applications
  - mcp__argus__screenshot
  - mcp__argus__zoom
  - mcp__argus__left_click
  - mcp__argus__double_click
  - mcp__argus__triple_click
  - mcp__argus__right_click
  - mcp__argus__middle_click
  - mcp__argus__mouse_move
  - mcp__argus__left_click_drag
  - mcp__argus__left_mouse_down
  - mcp__argus__left_mouse_up
  - mcp__argus__cursor_position
  - mcp__argus__scroll
  - mcp__argus__type
  - mcp__argus__key
  - mcp__argus__hold_key
  - mcp__argus__read_clipboard
  - mcp__argus__write_clipboard
  - mcp__argus__open_application
  - mcp__argus__switch_display
  - mcp__argus__computer_batch
  - mcp__argus__wait
  - mcp__argus__zoom
compatibility:
  platforms: [macos, windows]
---

# Argus GUI Automation

You have access to desktop GUI automation tools via the `argus` MCP server. These tools let you see and control the user's screen — take screenshots, click, type, scroll, and manage applications.

## Setup

The argus MCP server must be configured in `.mcp.json`:
```json
{
  "mcpServers": {
    "argus": {
      "command": "node",
      "args": ["<path-to>/argus-automation/dist/index.js"]
    }
  }
}
```

### macOS Prerequisites
- Grant **Accessibility** permission to your terminal app (System Settings → Privacy & Security → Accessibility)
- Grant **Screen Recording** permission to your terminal app (System Settings → Privacy & Security → Screen Recording)
- If permissions are missing, `request_access` will show the TCC state and guide the user

### Windows Prerequisites
- No special permissions needed
- Windows 10/11 supported

## Workflow

### 1. Request Access First
Before interacting with any application, you MUST call `request_access` with the app names:
```
request_access({ application_names: ["Safari", "Finder"], reason: "Navigate to a website" })
```

### 2. Screenshot → Analyze → Act
Always take a screenshot before acting. Never click blindly.
```
screenshot()  →  analyze the image  →  left_click({ coordinate: [x, y] })
```

### 3. Use Batch for Efficiency
Combine multiple actions into one call to reduce latency:
```
computer_batch({ actions: [
  { action: "left_click", coordinate: [100, 200] },
  { action: "type", text: "hello" },
  { action: "key", text: "Return" },
  { action: "screenshot" }
]})
```

## Key Rules

1. **Always screenshot first** — never guess coordinates. The screen may have changed.
2. **Request access before interaction** — tools will error if the frontmost app isn't in your allowlist.
3. **Use batch for multi-step actions** — reduces round-trips by 60%+.
4. **CJK text: use clipboard** — for non-ASCII text, use `type` with `via_clipboard: true`, or manually `write_clipboard` + `key("cmd+v")` (macOS) / `key("ctrl+v")` (Windows).
5. **Coordinate system** — coordinates are in logical pixels matching the screenshot dimensions. (0,0) is top-left.
6. **Permission tiers** — browsers are "read" (visible only), terminals are "click" (no typing), other apps are "full".
7. **One session at a time** — if another Claude session is using the computer, you'll get a lock error. Wait or ask the user to stop the other session.

## Tool Quick Reference

| Tool | Purpose |
|------|---------|
| `request_access` | Grant permission to interact with apps |
| `screenshot` | Capture the current screen |
| `zoom` | High-res capture of a screen region |
| `left_click` | Click at coordinates |
| `double_click` | Double-click |
| `type` | Type text (use `via_clipboard` for CJK) |
| `key` | Press key combo ("cmd+c", "Return", etc.) |
| `scroll` | Scroll at position |
| `computer_batch` | Run multiple actions in one call |
| `open_application` | Launch an app |
| `read_clipboard` / `write_clipboard` | Clipboard access |

## Platform Differences

| Feature | macOS | Windows |
|---------|-------|---------|
| Paste shortcut | Cmd+V | Ctrl+V |
| App identifier | Bundle ID (com.apple.Safari) | EXE name (CHROME.EXE) |
| Window hiding | Compositor-level (safe) | Minimize (disabled by default) |
| Permissions | TCC (Accessibility + Screen Recording) | None needed |
| File manager | Finder (always allowed) | Explorer (add to allowlist) |
