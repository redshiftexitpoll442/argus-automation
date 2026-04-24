/**
 * Integration tests for the Windows executor.
 *
 * Tests the full pipeline: native modules → executor interface → results.
 * These tests interact with real hardware.
 */

import { describe, it, expect } from "vitest";
import { createWindowsExecutor } from "../../src/windows/executor.js";

const executor = createWindowsExecutor({
  getMouseAnimationEnabled: () => false,
  getHideBeforeActionEnabled: () => false,
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("executor — capabilities", () => {
  it("should report win32 platform with no screenshot filtering", () => {
    expect(executor.capabilities.platform).toBe("win32");
    expect(executor.capabilities.screenshotFiltering).toBe("none");
    expect(executor.capabilities.hostBundleId).toBe("argus-automation");
  });
});

describe("executor — display", () => {
  it("should list at least one display", async () => {
    const displays = await executor.listDisplays();
    expect(displays.length).toBeGreaterThanOrEqual(1);

    const primary = displays.find((d) => d.isPrimary);
    expect(primary).toBeDefined();
    expect(primary!.width).toBeGreaterThan(0);
    expect(primary!.scaleFactor).toBeGreaterThanOrEqual(1);
  });

  it("should get display size", async () => {
    const size = await executor.getDisplaySize();
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
    expect(size.scaleFactor).toBeGreaterThanOrEqual(1);
  });
});

describe("executor — screenshot", () => {
  it("should capture a screenshot with correct structure", async () => {
    const result = await executor.screenshot({
      allowedBundleIds: [],
    });

    expect(result.base64).toBeTypeOf("string");
    expect(result.base64.length).toBeGreaterThan(100);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.displayWidth).toBeGreaterThan(0);
    expect(result.displayHeight).toBeGreaterThan(0);
    expect(result.displayId).toBeTypeOf("number");

    // Verify JPEG
    const buf = Buffer.from(result.base64, "base64");
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
  });

  it("should zoom into a region", async () => {
    const zoomed = await executor.zoom(
      { x: 0, y: 0, w: 200, h: 200 },
      [],
    );
    expect(zoomed.base64.length).toBeGreaterThan(100);
    expect(zoomed.width).toBeGreaterThan(0);
    expect(zoomed.height).toBeGreaterThan(0);
  });
});

describe("executor — mouse", () => {
  it("should get cursor position", async () => {
    const pos = await executor.getCursorPosition();
    expect(pos.x).toBeTypeOf("number");
    expect(pos.y).toBeTypeOf("number");
  });

  it("should move mouse and verify position", async () => {
    let pos = await executor.getCursorPosition();
    for (let attempt = 0; attempt < 5; attempt++) {
      await executor.moveMouse(150, 150);
      await sleep(100);
      pos = await executor.getCursorPosition();
      if (Math.abs(pos.x - 150) < 5 && Math.abs(pos.y - 150) < 5) {
        break;
      }
    }
    expect(Math.abs(pos.x - 150)).toBeLessThan(5);
    expect(Math.abs(pos.y - 150)).toBeLessThan(5);
  });
});

describe("executor — keyboard", () => {
  it("should press and release a key without error", async () => {
    // Shift is harmless
    await expect(executor.key("shift")).resolves.not.toThrow();
  });

  it("should hold and release a key", async () => {
    await expect(executor.holdKey(["shift"], 50)).resolves.not.toThrow();
  });
});

describe("executor — app management", () => {
  it("should get frontmost app", async () => {
    const app = await executor.getFrontmostApp();
    expect(app).not.toBeNull();
    if (app) {
      expect(app.bundleId).toBeTypeOf("string");
      expect(app.bundleId.length).toBeGreaterThan(0);
      expect(app.displayName).toBeTypeOf("string");
    }
  });

  it("should list running apps", async () => {
    const apps = await executor.listRunningApps();
    expect(apps.length).toBeGreaterThanOrEqual(1);
    for (const app of apps) {
      expect(app.bundleId).toBeTypeOf("string");
      expect(app.displayName).toBeTypeOf("string");
    }
  });

  it("should list installed apps", async () => {
    const apps = await executor.listInstalledApps();
    expect(apps.length).toBeGreaterThanOrEqual(1);
    for (const app of apps) {
      expect(app.bundleId).toBeTypeOf("string");
      expect(app.displayName).toBeTypeOf("string");
    }
  });
});

describe("executor — clipboard", () => {
  it("should round-trip clipboard text", async () => {
    const text = "executor-integration-test-" + Date.now();
    await executor.writeClipboard(text);
    const result = await executor.readClipboard();
    expect(result).toBe(text);
  });
});

describe("executor — resolvePrepareCapture", () => {
  it("should capture with resolve (atomic path)", async () => {
    const result = await executor.resolvePrepareCapture({
      allowedBundleIds: [],
      autoResolve: false,
    });

    expect(result.base64).toBeTypeOf("string");
    expect(result.hidden).toBeInstanceOf(Array);
    expect(result.captureError).toBeUndefined();
    expect(result.width).toBeGreaterThan(0);
  });
});
