/**
 * Integration test for the MCP server.
 *
 * Tests that the MCP server starts, lists tools, and handles
 * basic tool calls through the upstream dispatch pipeline.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createComputerUseMcpServer } from "../../src/upstream/mcpServer.js";
import type {
  ComputerUseSessionContext,
  AppGrant,
  CuGrantFlags,
  CuPermissionResponse,
  ScreenshotDims,
} from "../../src/upstream/types.js";
import { DEFAULT_GRANT_FLAGS } from "../../src/upstream/types.js";
import { createWindowsHostAdapter } from "../../src/windows/host-adapter.js";

let client: Client;

/**
 * Create a simple auto-approve session context for testing.
 */
function createTestSessionContext(): ComputerUseSessionContext {
  let allowedApps: AppGrant[] = [];
  let grantFlags: CuGrantFlags = { ...DEFAULT_GRANT_FLAGS };
  let lastDims: ScreenshotDims | undefined;

  return {
    getAllowedApps: () => allowedApps,
    getGrantFlags: () => grantFlags,
    getUserDeniedBundleIds: () => [],
    getSelectedDisplayId: () => undefined,
    getLastScreenshotDims: () => lastDims,
    onPermissionRequest: async (req, _signal) => {
      const granted: AppGrant[] = req.apps
        .filter((a) => a.resolved && !a.alreadyGranted)
        .map((a) => ({
          bundleId: a.resolved!.bundleId,
          displayName: a.resolved!.displayName,
          grantedAt: Date.now(),
          tier: a.proposedTier,
        }));
      return {
        granted,
        denied: [],
        flags: {
          clipboardRead: true,
          clipboardWrite: true,
          systemKeyCombos: false,
        },
      } satisfies CuPermissionResponse;
    },
    onAllowedAppsChanged: (apps, flags) => {
      allowedApps = [...apps];
      grantFlags = flags;
    },
    onScreenshotCaptured: (dims) => {
      lastDims = dims;
    },
  };
}

describe("MCP Server — tool listing", () => {
  let server: Awaited<ReturnType<typeof createComputerUseMcpServer>>;

  beforeAll(async () => {
    const adapter = createWindowsHostAdapter({
      serverName: "test-server",
      logger: {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
        silly: () => {},
      },
    });

    const ctx = createTestSessionContext();
    server = createComputerUseMcpServer(adapter, "pixels", ctx);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "1.0" });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client?.close();
    await server?.close();
  });

  it("should list 20+ computer-use tools", async () => {
    const result = await client.listTools();
    expect(result.tools.length).toBeGreaterThanOrEqual(20);

    // Check key tools exist
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("screenshot");
    expect(names).toContain("left_click");
    expect(names).toContain("type");
    expect(names).toContain("key");
    expect(names).toContain("scroll");
    expect(names).toContain("request_access");
    expect(names).toContain("computer_batch");
    expect(names).toContain("zoom");
    expect(names).toContain("cursor_position");
    expect(names).toContain("read_clipboard");
    expect(names).toContain("write_clipboard");
  });

  it("should have correct schema for screenshot tool", async () => {
    const result = await client.listTools();
    const screenshotTool = result.tools.find((t) => t.name === "screenshot");
    expect(screenshotTool).toBeDefined();
    expect(screenshotTool!.description).toContain("NOT filtered");
  });

  it("should handle request_access tool call", async () => {
    const result = await client.callTool({
      name: "request_access",
      arguments: {
        apps: ["NOTEPAD.EXE"],
        reason: "Integration test",
        clipboardRead: true,
        clipboardWrite: true,
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
  });

  it("should handle cursor_position tool call", async () => {
    const result = await client.callTool({
      name: "cursor_position",
      arguments: {},
    });

    expect(result.isError).not.toBe(true);
    const text = (result.content[0] as { text: string }).text;
    // Should contain coordinates
    expect(text).toMatch(/\d+/);
  });

  it("should handle wait tool call", async () => {
    const result = await client.callTool({
      name: "wait",
      arguments: { duration: 0.1 },
    });

    expect(result.isError).not.toBe(true);
  });
});
