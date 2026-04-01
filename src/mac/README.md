# darwin/ — macOS Computer Use Implementation

Original Claude Code computer-use code, extracted for standalone MCP server use.

## Origin

These files come from Claude Code's `src/utils/computerUse/`. Only import paths
were changed to work in this project — logic is identical to the original.

## Native Dependencies

Requires two Anthropic native modules (from Claude Code installation):
- `@ant/computer-use-swift` — SCContentFilter screenshots, NSWorkspace, TCC checks
- `@ant/computer-use-input` — Rust/enigo mouse + keyboard

## Files

| File | Lines | Origin | What it does |
|------|-------|--------|--------------|
| `executor.ts` | 659 | Original | ComputerExecutor impl — the core |
| `hostAdapter.ts` | 70 | Original | HostAdapter singleton + TCC checks |
| `computerUseLock.ts` | 216 | Original | O_EXCL file lock (`~/.claude/computer-use.lock`) |
| `drainRunLoop.ts` | 80 | Original | CFRunLoop pump (without this, native calls hang!) |
| `escHotkey.ts` | 55 | Original | Global Escape hotkey via CGEventTap |
| `common.ts` | 62 | Original | Terminal detection + platform constants |
| `swiftLoader.ts` | 24 | Original | @ant/computer-use-swift loader |
| `inputLoader.ts` | 31 | Original | @ant/computer-use-input loader |
| **`shims.ts`** | **~110** | **New** | Standalone replacements for Claude Code deps |
| `types-ant-*.d.ts` | ~100 | New | Type declarations for cross-platform tsc |

## What `shims.ts` replaces

| Claude Code dep | Shim replacement |
|----------------|------------------|
| `logForDebugging` | File logger (`../logger.ts`) |
| `sleep` | `setTimeout` wrapper |
| `execFileNoThrow` | `child_process.execFile` wrapper |
| `env.terminal` | `process.env.TERM_PROGRAM` |
| `getSessionId` | `randomUUID()` |
| `getClaudeConfigHomeDir` | `~/.claude` |
| `withResolvers` | `Promise.withResolvers` polyfill |
| `registerCleanup` | `process.on("exit")` |
| `getChicagoSubGates` | Hardcoded defaults |
