/**
 * Unit tests for native/clipboard.ts
 *
 * These tests interact with the real Windows clipboard.
 * They save and restore the original clipboard content.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  readClipboard,
  writeClipboard,
} from "../../src/native/clipboard.js";

let originalClipboard: string;

beforeAll(async () => {
  try {
    originalClipboard = await readClipboard();
  } catch {
    originalClipboard = "";
  }
});

afterAll(async () => {
  // Restore original clipboard
  try {
    await writeClipboard(originalClipboard);
  } catch {
    // best effort
  }
});

describe("clipboard", () => {
  it("should write and read back text", async () => {
    const testText = "Hello from windows-computer-use-mcp test!";
    await writeClipboard(testText);
    const result = await readClipboard();
    expect(result).toBe(testText);
  });

  it("should handle empty string", async () => {
    await writeClipboard("");
    const result = await readClipboard();
    expect(result).toBe("");
  });

  it("should handle special characters", async () => {
    const testText = "Special: 你好 & <tag> \"quotes\" 'single'";
    await writeClipboard(testText);
    const result = await readClipboard();
    expect(result).toBe(testText);
  });

  it("should handle multiline text", async () => {
    const testText = "Line 1\nLine 2\nLine 3";
    await writeClipboard(testText);
    const result = await readClipboard();
    // Windows may normalize line endings
    expect(result.replace(/\r\n/g, "\n")).toBe(testText);
  });
});
