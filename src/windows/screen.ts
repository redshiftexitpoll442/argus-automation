/**
 * Screenshot module — wraps node-screenshots + sharp.
 *
 * Equivalent of @ant/computer-use-swift's SCContentFilter screenshot capture.
 * Uses DXGI/BitBlt via node-screenshots for capture, sharp for JPEG + resize.
 */

import { Monitor } from "node-screenshots";
import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DisplayGeometry, ScreenshotResult } from "../upstream/executor.js";
import { targetImageSize, API_RESIZE_PARAMS } from "../upstream/imageResize.js";

// ── Screenshot cache ─────────────────────────────────────────────────────────

/**
 * Directory for cached screenshots. Resolved relative to the project root
 * (gui-automation/screenshots/). Created on first save.
 */
let _screenshotDir: string | null = null;

function getScreenshotDir(): string {
  if (!_screenshotDir) {
    // Walk up from dist/windows/ or src/windows/ to the repo root's parent
    // __dirname at runtime = .../argus-automation/dist/windows
    // We want gui-automation/screenshots (two levels up from argus-automation)
    const argusRoot = join(import.meta.dirname ?? __dirname, "..", "..");
    _screenshotDir = join(argusRoot, "..", "screenshots");
  }
  return _screenshotDir;
}

/**
 * Save a JPEG base64 screenshot to the cache directory.
 * Fire-and-forget — failures must never block the MCP server.
 */
async function cacheScreenshot(
  base64: string,
  tag: "full" | "region" | "zoom",
): Promise<void> {
  try {
    const dir = getScreenshotDir();
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, "-"); // 2026-04-04T12-30-45-123Z
    const filename = `${tag}_${ts}.jpg`;
    await writeFile(join(dir, filename), Buffer.from(base64, "base64"));
  } catch {
    // Swallow — caching failure must never block the MCP server.
  }
}

const SCREENSHOT_JPEG_QUALITY = 75; // 0.75 in Chicago MCP → 75 in sharp (1-100 scale)

/**
 * Logical → physical → API target dims. See `targetImageSize` + COORDINATES.md.
 */
function computeTargetDims(
  logicalW: number,
  logicalH: number,
  scaleFactor: number,
): [number, number] {
  const physW = Math.round(logicalW * scaleFactor);
  const physH = Math.round(logicalH * scaleFactor);
  return targetImageSize(physW, physH, API_RESIZE_PARAMS);
}

/**
 * Find a monitor by displayId, or return the primary monitor.
 */
function findMonitor(displayId?: number): Monitor {
  const monitors = Monitor.all();
  if (monitors.length === 0) {
    throw new Error("No monitors detected");
  }

  if (displayId !== undefined) {
    const found = monitors.find((m) => m.id() === displayId);
    if (found) return found;
    // Fall back to primary if requested display not found
  }

  // Return primary, or first if no primary
  return monitors.find((m) => m.isPrimary()) ?? monitors[0]!;
}

/**
 * Convert raw image buffer (BGRA from node-screenshots) to JPEG base64
 * with resize to target dimensions.
 */
async function imageToJpegBase64(
  rawBuffer: Buffer,
  srcWidth: number,
  srcHeight: number,
  targetW: number,
  targetH: number,
  quality: number = SCREENSHOT_JPEG_QUALITY,
): Promise<{ base64: string; width: number; height: number }> {
  const result = await sharp(rawBuffer, {
    raw: { width: srcWidth, height: srcHeight, channels: 4 },
  })
    .resize(targetW, targetH, { fit: "fill" })
    .jpeg({ quality })
    .toBuffer();

  return {
    base64: result.toString("base64"),
    width: targetW,
    height: targetH,
  };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * List all monitors with geometry info.
 */
export function listMonitors(): DisplayGeometry[] {
  return Monitor.all().map((m) => ({
    displayId: m.id(),
    label: m.name() || undefined,
    width: Math.round(m.width() / m.scaleFactor()),
    height: Math.round(m.height() / m.scaleFactor()),
    originX: m.x(),
    originY: m.y(),
    scaleFactor: m.scaleFactor(),
    isPrimary: m.isPrimary(),
  }));
}

/**
 * Get a single monitor's geometry.
 */
export function getMonitorGeometry(displayId?: number): DisplayGeometry {
  const m = findMonitor(displayId);
  return {
    displayId: m.id(),
    label: m.name() || undefined,
    width: Math.round(m.width() / m.scaleFactor()),
    height: Math.round(m.height() / m.scaleFactor()),
    originX: m.x(),
    originY: m.y(),
    scaleFactor: m.scaleFactor(),
    isPrimary: m.isPrimary(),
  };
}

/**
 * Full-screen capture. Pre-sizes to API target dimensions so the API
 * transcoder's early-return fires — no server-side resize.
 */
export async function captureMonitor(
  displayId?: number,
): Promise<ScreenshotResult> {
  const monitor = findMonitor(displayId);
  const geo = getMonitorGeometry(displayId);

  const [targetW, targetH] = computeTargetDims(
    geo.width,
    geo.height,
    geo.scaleFactor,
  );

  const image = await monitor.captureImage();
  const rawBuffer = await image.toRaw();

  const jpeg = await imageToJpegBase64(
    rawBuffer,
    image.width,
    image.height,
    targetW,
    targetH,
  );

  // Cache to local screenshots/ folder (fire-and-forget)
  cacheScreenshot(jpeg.base64, "full");

  return {
    base64: jpeg.base64,
    width: jpeg.width,
    height: jpeg.height,
    displayWidth: geo.width,
    displayHeight: geo.height,
    displayId: geo.displayId,
    originX: geo.originX,
    originY: geo.originY,
  };
}

/**
 * Capture a region of the screen. Coordinates are in logical (not physical) space.
 * Output is resized to target dimensions for optimal API token usage.
 */
export async function captureRegion(
  x: number,
  y: number,
  w: number,
  h: number,
  outW: number,
  outH: number,
  quality: number = SCREENSHOT_JPEG_QUALITY,
  displayId?: number,
): Promise<{ base64: string; width: number; height: number }> {
  const monitor = findMonitor(displayId);
  const scale = monitor.scaleFactor();

  // Capture full monitor first, then crop
  const image = await monitor.captureImage();

  // Convert logical coordinates to physical pixels relative to monitor
  const monX = monitor.x();
  const monY = monitor.y();
  const cropX = Math.round((x - monX) * scale);
  const cropY = Math.round((y - monY) * scale);
  const cropW = Math.round(w * scale);
  const cropH = Math.round(h * scale);

  // Clamp to image bounds
  const clampedX = Math.max(0, Math.min(cropX, image.width - 1));
  const clampedY = Math.max(0, Math.min(cropY, image.height - 1));
  const clampedW = Math.min(cropW, image.width - clampedX);
  const clampedH = Math.min(cropH, image.height - clampedY);

  if (clampedW <= 0 || clampedH <= 0) {
    throw new Error(
      `Region out of bounds: (${x},${y},${w},${h}) on display ${monitor.id()}`,
    );
  }

  const cropped = await image.crop(clampedX, clampedY, clampedW, clampedH);
  const rawBuffer = await cropped.toRaw();

  const result = await imageToJpegBase64(
    rawBuffer,
    cropped.width,
    cropped.height,
    outW,
    outH,
    quality,
  );

  // Cache to local screenshots/ folder (fire-and-forget)
  cacheScreenshot(result.base64, "region");

  return result;
}

/**
 * Crop raw pixel bytes from a JPEG base64 image. Used by pixelCompare
 * staleness guard. Returns null on any failure (validation failure must
 * never block an action).
 */
export async function cropRawPatch(
  jpegBase64: string,
  rect: { x: number; y: number; width: number; height: number },
): Promise<Buffer | null> {
  try {
    const buf = Buffer.from(jpegBase64, "base64");
    const result = await sharp(buf)
      .extract({
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      })
      .raw()
      .toBuffer();
    return result;
  } catch {
    return null;
  }
}
