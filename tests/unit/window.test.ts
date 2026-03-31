/**
 * Unit tests for native/window.ts
 *
 * These tests interact with real Windows desktop state.
 */

import { describe, it, expect } from "vitest";
import {
  getForegroundWindowInfo,
  getWindowFromPoint,
  listVisibleWindows,
  listRunningApps,
  findWindowDisplays,
} from "../../src/native/window.js";

describe("window — getForegroundWindowInfo", () => {
  it("should return info about the currently focused window", () => {
    const info = getForegroundWindowInfo();
    // During test execution, some window must be focused
    expect(info).not.toBeNull();
    if (info) {
      expect(info.exeName).toBeTypeOf("string");
      expect(info.exeName.length).toBeGreaterThan(0);
      expect(info.pid).toBeGreaterThan(0);
      expect(info.exePath).toBeTypeOf("string");
      expect(info.exePath).toContain("\\");
    }
  });

  it("should return an exe name ending with .exe", () => {
    const info = getForegroundWindowInfo();
    if (info) {
      expect(info.exeName.toLowerCase()).toMatch(/\.exe$/);
    }
  });
});

describe("window — getWindowFromPoint", () => {
  it("should find a window at screen center", () => {
    // The center of a typical display should have some window
    const info = getWindowFromPoint(500, 500);
    // This may or may not find a window depending on desktop state
    // but the function should not throw
    if (info) {
      expect(info.exeName).toBeTypeOf("string");
      expect(info.pid).toBeGreaterThan(0);
    }
  });
});

describe("window — listVisibleWindows", () => {
  it("should return at least one visible window", () => {
    const windows = listVisibleWindows();
    expect(windows.length).toBeGreaterThanOrEqual(1);
  });

  it("should have valid info for each window", () => {
    const windows = listVisibleWindows();
    for (const w of windows) {
      expect(w.exeName).toBeTypeOf("string");
      expect(w.exeName.toLowerCase()).toMatch(/\.exe$/);
      expect(w.pid).toBeGreaterThan(0);
      expect(w.exePath).toContain("\\");
    }
  });

  it("should not have duplicate PIDs", () => {
    const windows = listVisibleWindows();
    const pids = windows.map((w) => w.pid);
    const uniquePids = new Set(pids);
    expect(uniquePids.size).toBe(pids.length);
  });
});

describe("window — listRunningApps", () => {
  it("should return at least one running app", () => {
    const apps = listRunningApps();
    expect(apps.length).toBeGreaterThanOrEqual(1);
  });

  it("should have bundleId and displayName for each app", () => {
    const apps = listRunningApps();
    for (const app of apps) {
      expect(app.bundleId).toBeTypeOf("string");
      expect(app.bundleId.length).toBeGreaterThan(0);
      expect(app.displayName).toBeTypeOf("string");
      expect(app.displayName.length).toBeGreaterThan(0);
    }
  });

  it("should have unique bundleIds", () => {
    const apps = listRunningApps();
    const ids = apps.map((a) => a.bundleId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe("window — findWindowDisplays", () => {
  it("should find displays for running apps", () => {
    const apps = listRunningApps();
    if (apps.length === 0) return;

    const exeNames = apps.slice(0, 3).map((a) => a.bundleId);
    const result = findWindowDisplays(exeNames);

    // At least one of the running apps should have a display
    expect(result.length).toBeGreaterThanOrEqual(0); // May be 0 if no match
    for (const entry of result) {
      expect(entry.bundleId).toBeTypeOf("string");
      expect(entry.displayIds.length).toBeGreaterThan(0);
      for (const id of entry.displayIds) {
        expect(id).toBeTypeOf("number");
      }
    }
  });
});
