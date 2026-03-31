/**
 * Tests for upstream imageResize.ts — pure math, no OS interaction.
 */

import { describe, it, expect } from "vitest";
import {
  targetImageSize,
  API_RESIZE_PARAMS,
} from "../../../src/upstream/imageResize.js";

describe("imageResize — targetImageSize", () => {
  it("should return dimensions that fit within the token budget", () => {
    const [w, h] = targetImageSize(3200, 2000, API_RESIZE_PARAMS);
    const tokens = Math.ceil(w / 28) * Math.ceil(h / 28);
    expect(tokens).toBeLessThanOrEqual(1568);
  });

  it("should not exceed long side of 1568", () => {
    const [w, h] = targetImageSize(5120, 2880, API_RESIZE_PARAMS);
    expect(Math.max(w, h)).toBeLessThanOrEqual(1568);
  });

  it("should preserve aspect ratio approximately", () => {
    const srcW = 1920;
    const srcH = 1080;
    const srcRatio = srcW / srcH;
    const [w, h] = targetImageSize(srcW, srcH, API_RESIZE_PARAMS);
    const outRatio = w / h;
    // Allow 5% deviation from rounding
    expect(Math.abs(outRatio - srcRatio) / srcRatio).toBeLessThan(0.05);
  });

  it("should handle square inputs", () => {
    const [w, h] = targetImageSize(2000, 2000, API_RESIZE_PARAMS);
    // Square input → square-ish output
    expect(Math.abs(w - h)).toBeLessThan(50);
    const tokens = Math.ceil(w / 28) * Math.ceil(h / 28);
    expect(tokens).toBeLessThanOrEqual(1568);
  });

  it("should handle small inputs (no upscale needed)", () => {
    const [w, h] = targetImageSize(100, 100, API_RESIZE_PARAMS);
    // Already fits → should return something reasonable
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  });

  it("should handle typical HiDPI resolutions", () => {
    // 2x Retina 13": 2560×1600 logical → 5120×3200 physical
    const [w1, h1] = targetImageSize(5120, 3200, API_RESIZE_PARAMS);
    expect(Math.ceil(w1 / 28) * Math.ceil(h1 / 28)).toBeLessThanOrEqual(1568);

    // 4K: 3840×2160
    const [w2, h2] = targetImageSize(3840, 2160, API_RESIZE_PARAMS);
    expect(Math.ceil(w2 / 28) * Math.ceil(h2 / 28)).toBeLessThanOrEqual(1568);

    // 1080p: 1920×1080
    const [w3, h3] = targetImageSize(1920, 1080, API_RESIZE_PARAMS);
    expect(Math.ceil(w3 / 28) * Math.ceil(h3 / 28)).toBeLessThanOrEqual(1568);
  });
});
