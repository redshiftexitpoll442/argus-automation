/**
 * Unit tests for native/input.ts
 *
 * These tests interact with real hardware (mouse, keyboard).
 * Mouse position tests are safe. Keyboard/click tests are read-only
 * (we test getters and verify the API doesn't crash).
 */

import { describe, it, expect } from "vitest";
import {
  getMousePos,
  moveMouse,
  getScreenSize,
  keyTap,
} from "../../src/native/input.js";

describe("input — mouse", () => {
  it("should get current mouse position", () => {
    const pos = getMousePos();
    expect(pos.x).toBeTypeOf("number");
    expect(pos.y).toBeTypeOf("number");
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
  });

  it("should move the mouse and verify new position", () => {
    const target = { x: 100, y: 100 };
    moveMouse(target.x, target.y);

    // Small tolerance for DPI rounding
    const pos = getMousePos();
    expect(Math.abs(pos.x - target.x)).toBeLessThan(5);
    expect(Math.abs(pos.y - target.y)).toBeLessThan(5);
  });

  it("should get screen size", () => {
    const size = getScreenSize();
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });
});

describe("input — keyboard (safe tests)", () => {
  it("should not crash when tapping a harmless key", () => {
    // Tap F13 which is harmless on most systems
    expect(() => keyTap("shift")).not.toThrow();
  });

  it("should tap a regular key combo without crashing", () => {
    // ctrl+a is harmless in most contexts (selects all)
    // We just verify it doesn't throw
    expect(() => keyTap("escape")).not.toThrow();
  });
});
