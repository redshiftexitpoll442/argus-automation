# Source Code Structure

```
src/
│
├── index.ts                    # Entry point — detects platform, loads correct adapter
│
├── upstream/                   # Anthropic's Chicago MCP (DO NOT MODIFY)
│   ├── toolCalls.ts            #   3,649-line dispatch engine
│   ├── mcpServer.ts            #   MCP server factory + session binding
│   ├── tools.ts                #   24 tool schema definitions
│   ├── types.ts                #   All interfaces
│   └── executor.ts             #   ComputerExecutor interface (the abstraction boundary)
│
├── darwin/                     # macOS — original Claude Code implementation
│   ├── executor.ts             #   Uses @ant/computer-use-swift + @ant/computer-use-input
│   ├── hostAdapter.ts          #   TCC permission checks via Swift native
│   ├── drainRunLoop.ts         #   CFRunLoop pump (critical for native interop)
│   ├── computerUseLock.ts      #   Cross-process O_EXCL file lock
│   ├── shims.ts                #   ★ Only new file — replaces Claude Code deps
│   └── README.md               #   Details on each file's origin
│
├── native/                     # Windows — custom implementation
│   ├── screen.ts               #   node-screenshots + sharp
│   ├── input.ts                #   robotjs (SendInput)
│   ├── window.ts               #   koffi + Win32 API (FFI)
│   ├── clipboard.ts            #   PowerShell Get/Set-Clipboard
│   └── README.md               #   Module details
│
├── executor-windows.ts         # Windows ComputerExecutor assembly
├── host-adapter.ts             # Windows HostAdapter (sub-gates, no TCC)
├── logger.ts                   # Cross-platform file logger
├── common-win.ts               # Windows sentinel app constants
└── deniedApps-win.ts           # Windows app tier classification
```

## How it works

1. `index.ts` checks `process.platform`
2. **macOS** → `darwin/hostAdapter.ts` → `darwin/executor.ts` → native Swift/Rust modules
3. **Windows** → `host-adapter.ts` → `executor-windows.ts` → `native/*` modules
4. Both paths create a `ComputerUseHostAdapter` fed into `upstream/mcpServer.ts`
5. MCP server starts on stdio transport

## Deployment

### macOS
```bash
# Requires @ant/computer-use-swift and @ant/computer-use-input native modules
# Grant Accessibility + Screen Recording to your terminal app
npm run build && npm start
```

### Windows
```bash
npm install && npm run build && npm start
```

Configure in `.mcp.json`:
```json
{ "mcpServers": { "argus": { "command": "node", "args": ["<path>/dist/index.js"] } } }
```
