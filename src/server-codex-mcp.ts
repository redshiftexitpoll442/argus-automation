/**
 * Codex-oriented Computer Use MCP Server.
 *
 * This entry point is intentionally separate from server-mcp.ts, which keeps
 * the existing Claude Code / Anthropic tool surface unchanged.
 *
 * It does not call the OpenAI API and does not require OPENAI_API_KEY. Codex
 * invokes these local MCP tools with the active Codex session.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCodexComputerUseMcpServer } from "./codex/mcpServer.js";
import type { ComputerUseHostAdapter } from "./upstream/types.js";
import { getLogDir } from "./logger.js";

async function createHostAdapter(): Promise<ComputerUseHostAdapter> {
  if (process.platform === "darwin") {
    const { getComputerUseHostAdapter } = await import("./mac/hostAdapter.js");
    return getComputerUseHostAdapter();
  }

  if (process.platform === "win32") {
    const { createWindowsHostAdapter } = await import("./windows/host-adapter.js");
    return createWindowsHostAdapter({ serverName: "argus-codex" });
  }

  throw new Error(
    `Unsupported platform: ${process.platform}. ` +
    "Argus Codex computer use supports macOS and Windows.",
  );
}

async function main(): Promise<void> {
  const adapter = await createHostAdapter();
  const server = createCodexComputerUseMcpServer(adapter);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const platformLabel =
    process.platform === "darwin" ? "macOS" :
    process.platform === "win32" ? "Windows" :
    process.platform;

  adapter.logger.info(
    `Argus Codex Computer Use MCP Server started (${platformLabel}, stdio). Logs -> ${getLogDir()}`,
  );

  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

