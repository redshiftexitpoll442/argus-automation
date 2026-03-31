/**
 * Tests for upstream keyBlocklist.ts — pure logic, no OS interaction.
 */

import { describe, it, expect } from "vitest";
import {
  isSystemKeyCombo,
  normalizeKeySequence,
} from "../../../src/upstream/keyBlocklist.js";

describe("keyBlocklist — normalizeKeySequence", () => {
  it("should normalize modifier aliases", () => {
    expect(normalizeKeySequence("cmd+q")).toBe("meta+q");
    expect(normalizeKeySequence("command+q")).toBe("meta+q");
    expect(normalizeKeySequence("windows+l")).toBe("meta+l");
    expect(normalizeKeySequence("win+d")).toBe("meta+d");
  });

  it("should sort modifiers in canonical order", () => {
    expect(normalizeKeySequence("shift+ctrl+a")).toBe("ctrl+shift+a");
    expect(normalizeKeySequence("meta+alt+escape")).toBe("alt+meta+escape");
  });

  it("should handle case insensitivity", () => {
    expect(normalizeKeySequence("Ctrl+Alt+Delete")).toBe("ctrl+alt+delete");
    expect(normalizeKeySequence("ALT+F4")).toBe("alt+f4");
  });

  it("should deduplicate modifier aliases", () => {
    expect(normalizeKeySequence("cmd+command+q")).toBe("meta+q");
    expect(normalizeKeySequence("ctrl+control+c")).toBe("ctrl+c");
  });
});

describe("keyBlocklist — isSystemKeyCombo (win32)", () => {
  const platform = "win32" as const;

  it("should block Ctrl+Alt+Delete", () => {
    expect(isSystemKeyCombo("ctrl+alt+delete", platform)).toBe(true);
    expect(isSystemKeyCombo("control+alt+delete", platform)).toBe(true);
  });

  it("should block Alt+F4", () => {
    expect(isSystemKeyCombo("alt+f4", platform)).toBe(true);
  });

  it("should block Alt+Tab", () => {
    expect(isSystemKeyCombo("alt+tab", platform)).toBe(true);
  });

  it("should block Win+L (lock screen)", () => {
    expect(isSystemKeyCombo("win+l", platform)).toBe(true);
    expect(isSystemKeyCombo("meta+l", platform)).toBe(true);
    expect(isSystemKeyCombo("windows+l", platform)).toBe(true);
  });

  it("should block Win+D (show desktop)", () => {
    expect(isSystemKeyCombo("win+d", platform)).toBe(true);
  });

  it("should allow normal key combos", () => {
    expect(isSystemKeyCombo("ctrl+c", platform)).toBe(false);
    expect(isSystemKeyCombo("ctrl+v", platform)).toBe(false);
    expect(isSystemKeyCombo("ctrl+shift+s", platform)).toBe(false);
    expect(isSystemKeyCombo("alt+a", platform)).toBe(false);
  });

  it("should catch suffix bypass (e.g. ctrl+alt+delete+a)", () => {
    // ctrl+alt+delete+a still contains ctrl+alt+delete
    expect(isSystemKeyCombo("ctrl+alt+delete+a", platform)).toBe(true);
  });

  it("should not block modifier-only sequences", () => {
    expect(isSystemKeyCombo("ctrl+shift", platform)).toBe(false);
    expect(isSystemKeyCombo("alt", platform)).toBe(false);
  });
});

describe("keyBlocklist — isSystemKeyCombo (darwin)", () => {
  const platform = "darwin" as const;

  it("should block Cmd+Q", () => {
    expect(isSystemKeyCombo("cmd+q", platform)).toBe(true);
    expect(isSystemKeyCombo("command+q", platform)).toBe(true);
    expect(isSystemKeyCombo("meta+q", platform)).toBe(true);
  });

  it("should block Cmd+Tab", () => {
    expect(isSystemKeyCombo("cmd+tab", platform)).toBe(true);
  });

  it("should allow Cmd+C (not system-level)", () => {
    expect(isSystemKeyCombo("cmd+c", platform)).toBe(false);
  });
});
