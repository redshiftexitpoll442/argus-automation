/**
 * Unit tests for native/screen.ts
 *
 * These tests interact with real hardware (monitors).
 * They verify the screenshot pipeline works end-to-end.
 */

import { describe, it, expect } from "vitest";
import {
  listMonitors,
  getMonitorGeometry,
  captureMonitor,
  captureRegion,
  cropRawPatch,
} from "../../src/windows/screen.js";

describe("screen — listMonitors", () => {
  it("should return at least one monitor", () => {
    const monitors = listMonitors();
    expect(monitors.length).toBeGreaterThanOrEqual(1);
  });

  it("should have a primary monitor", () => {
    const monitors = listMonitors();
    const primary = monitors.find((m) => m.isPrimary);
    expect(primary).toBeDefined();
  });

  it("should have valid geometry for each monitor", () => {
    const monitors = listMonitors();
    for (const m of monitors) {
      expect(m.displayId).toBeTypeOf("number");
      expect(m.width).toBeGreaterThan(0);
      expect(m.height).toBeGreaterThan(0);
      expect(m.scaleFactor).toBeGreaterThanOrEqual(1);
      expect(typeof m.isPrimary).toBe("boolean");
    }
  });
});

describe("screen — getMonitorGeometry", () => {
  it("should return primary monitor when no ID specified", () => {
    const geo = getMonitorGeometry();
    expect(geo.width).toBeGreaterThan(0);
    expect(geo.height).toBeGreaterThan(0);
    expect(geo.scaleFactor).toBeGreaterThanOrEqual(1);
  });

  it("should return specific monitor when ID given", () => {
    const monitors = listMonitors();
    const first = monitors[0]!;
    const geo = getMonitorGeometry(first.displayId);
    expect(geo.displayId).toBe(first.displayId);
    expect(geo.width).toBe(first.width);
  });
});

describe("screen — captureMonitor", () => {
  it("should capture a JPEG screenshot of the primary monitor", async () => {
    const result = await captureMonitor();

    // Check basic structure
    expect(result.base64).toBeTypeOf("string");
    expect(result.base64.length).toBeGreaterThan(100);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.displayWidth).toBeGreaterThan(0);
    expect(result.displayHeight).toBeGreaterThan(0);
    expect(result.displayId).toBeTypeOf("number");

    // Verify it's valid JPEG by checking base64 header
    const buf = Buffer.from(result.base64, "base64");
    // JPEG magic bytes: FF D8 FF
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
    expect(buf[2]).toBe(0xff);
  });

  it("should produce an image smaller than the physical resolution (pre-sized for API)", async () => {
    const geo = getMonitorGeometry();
    const result = await captureMonitor();

    // The captured image should be smaller than physical pixels
    // (pre-sized by targetImageSize for API token optimization)
    const physW = Math.round(geo.width * geo.scaleFactor);
    const physH = Math.round(geo.height * geo.scaleFactor);
    expect(result.width).toBeLessThanOrEqual(physW);
    expect(result.height).toBeLessThanOrEqual(physH);
  });

  it("should preserve display geometry in the result", async () => {
    const geo = getMonitorGeometry();
    const result = await captureMonitor();
    expect(result.displayWidth).toBe(geo.width);
    expect(result.displayHeight).toBe(geo.height);
    expect(result.displayId).toBe(geo.displayId);
  });
});

describe("screen — captureRegion", () => {
  it("should capture a cropped region", async () => {
    const geo = getMonitorGeometry();
    // Capture a 200x200 logical region from the top-left
    const result = await captureRegion(
      geo.originX,
      geo.originY,
      200,
      200,
      100,
      100,
      75,
    );

    expect(result.base64).toBeTypeOf("string");
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);

    // Verify JPEG
    const buf = Buffer.from(result.base64, "base64");
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
  });
});

describe("screen — cropRawPatch", () => {
  it("should crop raw pixels from a JPEG base64 image", async () => {
    // First capture a screenshot to get valid JPEG
    const screenshot = await captureMonitor();

    // Crop a 9x9 patch (same as pixelCompare uses)
    const patch = await cropRawPatch(screenshot.base64, {
      x: 10,
      y: 10,
      width: 9,
      height: 9,
    });

    expect(patch).not.toBeNull();
    // Raw RGB buffer: 9 * 9 * 3 = 243 bytes
    expect(patch!.length).toBe(9 * 9 * 3);
  });

  it("should return null for invalid input", async () => {
    const patch = await cropRawPatch("not-valid-base64", {
      x: 0,
      y: 0,
      width: 9,
      height: 9,
    });
    expect(patch).toBeNull();
  });
});
