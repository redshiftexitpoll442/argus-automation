import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCodexComputerUseMcpServer } from "../../src/codex/mcpServer.js";
import type {
  ComputerExecutor,
  DisplayGeometry,
  FrontmostApp,
  InstalledApp,
  RunningApp,
  ScreenshotResult,
} from "../../src/upstream/executor.js";
import type { ComputerUseHostAdapter, Logger } from "../../src/upstream/types.js";

const noopLogger: Logger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  silly: () => {},
};

class FakeExecutor implements ComputerExecutor {
  public calls: Array<Record<string, unknown>> = [];
  private frontmost: FrontmostApp | null = {
    bundleId: "notepad.exe",
    displayName: "Notepad",
  };

  capabilities = {
    screenshotFiltering: "none" as const,
    platform: "win32" as const,
    hostBundleId: "argus-test",
    teachMode: false,
  };

  async prepareForAction(): Promise<string[]> { return []; }
  async previewHideSet(): Promise<Array<{ bundleId: string; displayName: string }>> { return []; }
  async getDisplaySize(): Promise<DisplayGeometry> {
    return {
      displayId: 1,
      width: 200,
      height: 100,
      originX: 10,
      originY: 20,
      scaleFactor: 1,
      isPrimary: true,
    };
  }
  async listDisplays(): Promise<DisplayGeometry[]> { return [await this.getDisplaySize()]; }
  async findWindowDisplays(): Promise<Array<{ bundleId: string; displayIds: number[] }>> { return []; }
  async resolvePrepareCapture(): Promise<ScreenshotResult & { hidden: string[] }> {
    return { ...(await this.screenshot({ allowedBundleIds: [] })), hidden: [] };
  }
  async screenshot(): Promise<ScreenshotResult> {
    return {
      base64: Buffer.from("fake-jpeg").toString("base64"),
      width: 100,
      height: 50,
      displayWidth: 200,
      displayHeight: 100,
      displayId: 1,
      originX: 10,
      originY: 20,
    };
  }
  async zoom(): Promise<{ base64: string; width: number; height: number }> {
    return { base64: Buffer.from("fake-jpeg").toString("base64"), width: 50, height: 50 };
  }
  async key(keySequence: string): Promise<void> { this.calls.push({ type: "key", keySequence }); }
  async holdKey(): Promise<void> {}
  async type(text: string): Promise<void> { this.calls.push({ type: "type", text }); }
  async readClipboard(): Promise<string> { return "clipboard"; }
  async writeClipboard(text: string): Promise<void> { this.calls.push({ type: "clipboard", text }); }
  async moveMouse(x: number, y: number): Promise<void> { this.calls.push({ type: "move", x, y }); }
  async click(
    x: number,
    y: number,
    button: "left" | "right" | "middle",
    count: 1 | 2 | 3,
  ): Promise<void> {
    this.calls.push({ type: "click", x, y, button, count });
  }
  async mouseDown(): Promise<void> { this.calls.push({ type: "mouseDown" }); }
  async mouseUp(): Promise<void> { this.calls.push({ type: "mouseUp" }); }
  async getCursorPosition(): Promise<{ x: number; y: number }> { return { x: 0, y: 0 }; }
  async drag(
    from: { x: number; y: number } | undefined,
    to: { x: number; y: number },
  ): Promise<void> {
    this.calls.push({ type: "drag", from, to });
  }
  async scroll(x: number, y: number, dx: number, dy: number): Promise<void> {
    this.calls.push({ type: "scroll", x, y, dx, dy });
  }
  async getFrontmostApp(): Promise<FrontmostApp | null> { return this.frontmost; }
  async appUnderPoint(): Promise<{ bundleId: string; displayName: string } | null> {
    return this.frontmost;
  }
  async listInstalledApps(): Promise<InstalledApp[]> {
    return [{ bundleId: "notepad.exe", displayName: "Notepad" }];
  }
  async getAppIcon(): Promise<string | undefined> { return undefined; }
  async listRunningApps(): Promise<RunningApp[]> {
    return [{ bundleId: "notepad.exe", displayName: "Notepad" }];
  }
  async openApp(bundleId: string): Promise<void> {
    this.frontmost = { bundleId, displayName: bundleId };
    this.calls.push({ type: "open", bundleId });
  }
}

describe("Codex MCP server", () => {
  let client: Client;
  let server: ReturnType<typeof createCodexComputerUseMcpServer>;
  let executor: FakeExecutor;

  beforeAll(async () => {
    executor = new FakeExecutor();
    const adapter: ComputerUseHostAdapter = {
      serverName: "argus-codex-test",
      logger: noopLogger,
      executor,
      async ensureOsPermissions() { return { granted: true as const }; },
      isDisabled() { return false; },
      getAutoUnhideEnabled() { return true; },
      getSubGates() {
        return {
          pixelValidation: false,
          clipboardPasteMultiline: true,
          mouseAnimation: false,
          hideBeforeAction: false,
          autoTargetDisplay: false,
          clipboardGuard: false,
        };
      },
      cropRawPatch() { return null; },
    };

    server = createCodexComputerUseMcpServer(adapter);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "codex-test-client", version: "1.0" });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client?.close();
    await server?.close();
  });

  it("lists the Codex-specific tools without Claude tools", async () => {
    const result = await client.listTools();
    const names = result.tools.map((tool) => tool.name);
    expect(names).toContain("computer_observe");
    expect(names).toContain("computer_execute");
    expect(names).toContain("computer_open_application");
    expect(names).not.toContain("request_access");
    expect(names).not.toContain("left_click");
  });

  it("reports that no OpenAI API key is used", async () => {
    const result = await client.callTool({ name: "computer_status", arguments: {} });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      mode: "codex-local-mcp",
      usesOpenAiApiKey: false,
    });
  });

  it("maps image-space click coordinates to display coordinates", async () => {
    await client.callTool({ name: "computer_authorize", arguments: { apps: ["notepad.exe"] } });
    await client.callTool({ name: "computer_observe", arguments: {} });
    const result = await client.callTool({
      name: "computer_execute",
      arguments: {
        actions: [{ type: "click", x: 50, y: 25 }],
      },
    });

    expect(result.structuredContent).toMatchObject({ ok: true });
    expect(executor.calls).toContainEqual({
      type: "click",
      x: 110,
      y: 70,
      button: "left",
      count: 1,
    });
  });
});

