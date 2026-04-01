# native/ — Windows Native Modules

Windows-specific implementations of screen capture, input, window management,
and clipboard. Written from scratch using cross-platform and Windows-specific
libraries to implement the `ComputerExecutor` interface.

## Files

| File | Lines | Library | What it does |
|------|-------|---------|--------------|
| `screen.ts` | 225 | node-screenshots + sharp | Screenshot capture, JPEG encode, DPI scaling |
| `input.ts` | 229 | robotjs | Mouse + keyboard via Win32 SendInput |
| `window.ts` | 430 | koffi (Win32 FFI) | Window enumeration, hide/show, activate, shellOpen |
| `clipboard.ts` | 72 | PowerShell | Get-Clipboard / Set-Clipboard |

## Assembled by

`../executor-windows.ts` composes these modules into a `ComputerExecutor`.
`../host-adapter.ts` wraps the executor into a `ComputerUseHostAdapter`.

## Note on cross-platform modules

`screen.ts` and `input.ts` use `node-screenshots` and `robotjs` which are
technically cross-platform. However, the macOS path uses Anthropic's native
modules (`@ant/computer-use-swift` + `@ant/computer-use-input`) instead,
because they provide SCContentFilter window-level filtering and proper
CGEvent-based input — capabilities these libraries don't offer.
