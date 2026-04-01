# Source Code Structure

```
src/
│
├── server-mcp.ts              # Entry: MCP stdio server (Claude Code / Codex)
├── logger.ts                  # Shared cross-platform file logger
│
├── upstream/                  # Anthropic's Chicago MCP engine (DO NOT MODIFY)
│   ├── toolCalls.ts           #   3,649-line dispatch engine
│   ├── mcpServer.ts           #   MCP server factory + session binding
│   ├── tools.ts               #   24 tool schema definitions
│   ├── types.ts               #   All interfaces
│   └── executor.ts            #   ComputerExecutor interface (the abstraction boundary)
│
├── mac/                       # macOS — original Claude Code implementation
│   ├── executor.ts            #   @ant/computer-use-swift + @ant/computer-use-input
│   ├── hostAdapter.ts         #   TCC permission checks via Swift native
│   ├── drainRunLoop.ts        #   CFRunLoop pump (critical for native interop)
│   ├── computerUseLock.ts     #   Cross-process O_EXCL file lock
│   ├── shims.ts               #   ★ Only new file — replaces Claude Code deps
│   └── README.md
│
├── windows/                   # Windows — custom implementation
│   ├── executor.ts            #   Assembles native modules into ComputerExecutor
│   ├── host-adapter.ts        #   Sub-gates, no TCC needed
│   ├── screen.ts              #   node-screenshots + sharp
│   ├── input.ts               #   robotjs (SendInput)
│   ├── window.ts              #   koffi + Win32 API (FFI)
│   ├── clipboard.ts           #   PowerShell Get/Set-Clipboard
│   ├── constants.ts           #   Sentinel app lists
│   ├── deniedApps.ts          #   App tier classification (browser/terminal/trading)
│   └── README.md
│
└── (future)
    ├── server-http.ts         #   HTTP REST bridge (OpenClaw)
    └── cli.ts                 #   CLI wrapper (OpenClaw)
```

## How it works

1. `server-mcp.ts` checks `process.platform`
2. **macOS** → `mac/hostAdapter.ts` → `mac/executor.ts` → native Swift/Rust modules
3. **Windows** → `windows/host-adapter.ts` → `windows/executor.ts` → `windows/*` modules
4. Both create a `ComputerUseHostAdapter` fed into `upstream/mcpServer.ts`
5. MCP server starts on stdio transport

## Deployment

Configure in `.mcp.json`:
```json
{ "mcpServers": { "argus": { "command": "node", "args": ["<path>/dist/server-mcp.js"] } } }
```
