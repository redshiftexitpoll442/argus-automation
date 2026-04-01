/**
 * macOS ComputerExecutor implementation.
 *
 * Mirrors executor-windows.ts but uses macOS-native window management and
 * clipboard. Screen capture (node-screenshots) and input (robotjs) are
 * cross-platform — shared with the Windows executor.
 *
 * Key differences from Windows:
 *   - capabilities.platform = "darwin" (upstream's native value)
 *   - Bundle IDs are real CFBundleIdentifiers (com.apple.Safari, etc.)
 *   - Paste shortcut is Cmd+V (not Ctrl+V)
 *   - hideBeforeAction uses compositor-level app hiding (safe, unlike Windows minimize)
 *   - FINDER_BUNDLE_ID ("com.apple.finder") matches upstream's hardcoded constant
 */

import type {
  ComputerExecutor,
  DisplayGeometry,
  FrontmostApp,
  InstalledApp,
  ResolvePrepareCaptureResult,
  RunningApp,
  ScreenshotResult,
} from "./upstream/executor.js";

// ── Cross-platform native modules (shared with Windows) ───────────────────
import {
  captureMonitor,
  captureRegion,
  listMonitors,
  getMonitorGeometry,
} from "./native/screen.js";
import {
  moveMouse as nativeMoveMouse,
  getMousePos,
  mouseClick as nativeMouseClick,
  mouseToggle,
  scrollMouse as nativeScrollMouse,
  keyTap,
  keyToggle,
  typeString,
} from "./native/input.js";

// ── macOS-specific native modules ─────────────────────────────────────────
import {
  getFrontmostApp as nativeGetFrontmostApp,
  getWindowFromPoint as nativeGetWindowFromPoint,
  listRunningApps as nativeListRunningApps,
  listVisibleWindows,
  hideWindows,
  unhideWindows,
  activateWindow,
  shellOpen,
  findWindowDisplays as nativeFindWindowDisplays,
} from "./native-darwin/window.js";
import {
  readClipboard as nativeReadClipboard,
  writeClipboard as nativeWriteClipboard,
} from "./native-darwin/clipboard.js";

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Host bundle ID. Matches what the upstream frontmost gate exempts.
 * On macOS this is a real-looking bundle ID (even though argus runs as a
 * CLI node process — the process is never frontmost).
 */
const DARWIN_HOST_BUNDLE_ID = "com.argus.automation";

/**
 * macOS Finder — upstream FINDER_BUNDLE_ID = "com.apple.finder".
 * Already hardcoded in toolCalls.ts:69 as always-allowed frontmost.
 */
const FINDER_BUNDLE_ID = "com.apple.finder";

// ── Helpers (shared logic from executor-windows.ts) ─────────────────────────

const MOVE_SETTLE_MS = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function moveAndSettle(x: number, y: number): Promise<void> {
  nativeMoveMouse(x, y);
  await sleep(MOVE_SETTLE_MS);
}

/**
 * Ease-out-cubic animated mouse movement for drag operations.
 * Identical to executor-windows.ts.
 */
async function animatedMove(
  targetX: number,
  targetY: number,
  enabled: boolean,
): Promise<void> {
  if (!enabled) {
    await moveAndSettle(targetX, targetY);
    return;
  }

  const start = getMousePos();
  const deltaX = targetX - start.x;
  const deltaY = targetY - start.y;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance < 1) return;

  const durationSec = Math.min(distance / 2000, 0.5);
  if (durationSec < 0.03) {
    await moveAndSettle(targetX, targetY);
    return;
  }

  const frameRate = 60;
  const frameIntervalMs = 1000 / frameRate;
  const totalFrames = Math.floor(durationSec * frameRate);

  for (let frame = 1; frame <= totalFrames; frame++) {
    const t = frame / totalFrames;
    const eased = 1 - Math.pow(1 - t, 3);
    nativeMoveMouse(
      Math.round(start.x + deltaX * eased),
      Math.round(start.y + deltaY * eased),
    );
    if (frame < totalFrames) {
      await sleep(frameIntervalMs);
    }
  }
  await sleep(MOVE_SETTLE_MS);
}

/**
 * Type text via clipboard paste. Uses Cmd+V on macOS (not Ctrl+V).
 * Saves/restores the user's clipboard.
 */
async function typeViaClipboard(text: string): Promise<void> {
  let saved: string | undefined;
  try {
    saved = await nativeReadClipboard();
  } catch {
    // proceed without restore
  }

  try {
    await nativeWriteClipboard(text);
    const readBack = await nativeReadClipboard();
    if (readBack !== text) {
      throw new Error("Clipboard write did not round-trip.");
    }
    // Cmd+V on macOS
    keyTap("command+v");
    await sleep(100);
  } finally {
    if (typeof saved === "string") {
      try {
        await nativeWriteClipboard(saved);
      } catch {
        // best-effort restore
      }
    }
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createDarwinExecutor(opts: {
  getMouseAnimationEnabled: () => boolean;
  getHideBeforeActionEnabled: () => boolean;
}): ComputerExecutor {
  const { getMouseAnimationEnabled, getHideBeforeActionEnabled } = opts;

  return {
    capabilities: {
      screenshotFiltering: "none", // "native" requires SCContentFilter (future)
      platform: "darwin",
      hostBundleId: DARWIN_HOST_BUNDLE_ID,
      teachMode: false,
    },

    // ── Pre-action sequence ───────────────────────────────────────────────

    async prepareForAction(
      allowlistBundleIds: string[],
      _displayId?: number,
    ): Promise<string[]> {
      if (!getHideBeforeActionEnabled()) return [];

      const allowSet = new Set(allowlistBundleIds);
      allowSet.add(FINDER_BUNDLE_ID);
      allowSet.add(DARWIN_HOST_BUNDLE_ID);

      const running = nativeListRunningApps();
      const toHide = running
        .filter((app) => !allowSet.has(app.bundleId))
        .map((app) => app.bundleId);

      if (toHide.length > 0) {
        hideWindows(toHide);
      }

      // Activate the first allowed app so we're not frontmost
      for (const id of allowlistBundleIds) {
        if (activateWindow(id)) break;
      }

      return toHide;
    },

    async previewHideSet(
      allowlistBundleIds: string[],
      _displayId?: number,
    ): Promise<Array<{ bundleId: string; displayName: string }>> {
      const allowSet = new Set(allowlistBundleIds);
      allowSet.add(FINDER_BUNDLE_ID);
      allowSet.add(DARWIN_HOST_BUNDLE_ID);

      const running = nativeListRunningApps();
      return running.filter((app) => !allowSet.has(app.bundleId));
    },

    // ── Display ───────────────────────────────────────────────────────────

    async getDisplaySize(displayId?: number): Promise<DisplayGeometry> {
      return getMonitorGeometry(displayId);
    },

    async listDisplays(): Promise<DisplayGeometry[]> {
      return listMonitors();
    },

    async findWindowDisplays(
      bundleIds: string[],
    ): Promise<Array<{ bundleId: string; displayIds: number[] }>> {
      return nativeFindWindowDisplays(bundleIds);
    },

    async resolvePrepareCapture(opts: {
      allowedBundleIds: string[];
      preferredDisplayId?: number;
      autoResolve: boolean;
      doHide?: boolean;
    }): Promise<ResolvePrepareCaptureResult> {
      let hidden: string[] = [];

      if (opts.doHide) {
        hidden = await this.prepareForAction(
          opts.allowedBundleIds,
          opts.preferredDisplayId,
        );
      }

      try {
        const screenshot = await captureMonitor(opts.preferredDisplayId);
        return { ...screenshot, hidden };
      } catch (err) {
        const geo = getMonitorGeometry(opts.preferredDisplayId);
        return {
          base64: "",
          width: 0,
          height: 0,
          displayWidth: geo.width,
          displayHeight: geo.height,
          displayId: geo.displayId,
          originX: geo.originX,
          originY: geo.originY,
          hidden,
          captureError: err instanceof Error ? err.message : String(err),
        };
      }
    },

    // ── Screenshot ────────────────────────────────────────────────────────

    async screenshot(opts: {
      allowedBundleIds: string[];
      displayId?: number;
    }): Promise<ScreenshotResult> {
      return captureMonitor(opts.displayId);
    },

    async zoom(
      regionLogical: { x: number; y: number; w: number; h: number },
      _allowedBundleIds: string[],
      displayId?: number,
    ): Promise<{ base64: string; width: number; height: number }> {
      const geo = getMonitorGeometry(displayId);
      const { targetImageSize, API_RESIZE_PARAMS } = await import(
        "./upstream/imageResize.js"
      );
      const physW = Math.round(regionLogical.w * geo.scaleFactor);
      const physH = Math.round(regionLogical.h * geo.scaleFactor);
      const [outW, outH] = targetImageSize(physW, physH, API_RESIZE_PARAMS);

      return captureRegion(
        regionLogical.x,
        regionLogical.y,
        regionLogical.w,
        regionLogical.h,
        outW,
        outH,
        75,
        displayId,
      );
    },

    // ── Keyboard ──────────────────────────────────────────────────────────

    async key(keySequence: string, repeat?: number): Promise<void> {
      const n = repeat ?? 1;
      for (let i = 0; i < n; i++) {
        if (i > 0) await sleep(8);
        keyTap(keySequence);
      }
    },

    async holdKey(keyNames: string[], durationMs: number): Promise<void> {
      const pressed: string[] = [];
      try {
        for (const k of keyNames) {
          keyToggle(k, "press");
          pressed.push(k);
        }
        await sleep(durationMs);
      } finally {
        for (const k of pressed.reverse()) {
          try { keyToggle(k, "release"); } catch { /* best-effort */ }
        }
      }
    },

    async type(text: string, opts: { viaClipboard: boolean }): Promise<void> {
      if (opts.viaClipboard) {
        await typeViaClipboard(text);
        return;
      }
      typeString(text);
    },

    // ── Clipboard ─────────────────────────────────────────────────────────

    async readClipboard(): Promise<string> {
      return nativeReadClipboard();
    },

    async writeClipboard(text: string): Promise<void> {
      return nativeWriteClipboard(text);
    },

    // ── Mouse ─────────────────────────────────────────────────────────────

    async moveMouse(x: number, y: number): Promise<void> {
      await moveAndSettle(x, y);
    },

    async click(
      x: number,
      y: number,
      button: "left" | "right" | "middle",
      count: 1 | 2 | 3,
      modifiers?: string[],
    ): Promise<void> {
      await moveAndSettle(x, y);

      if (modifiers && modifiers.length > 0) {
        for (const m of modifiers) keyToggle(m, "press");
        try {
          nativeMouseClick(button, count);
        } finally {
          for (const m of [...modifiers].reverse()) {
            try { keyToggle(m, "release"); } catch { /* best-effort */ }
          }
        }
      } else {
        nativeMouseClick(button, count);
      }
    },

    async mouseDown(): Promise<void> {
      mouseToggle("press", "left");
    },

    async mouseUp(): Promise<void> {
      mouseToggle("release", "left");
    },

    async getCursorPosition(): Promise<{ x: number; y: number }> {
      return getMousePos();
    },

    async drag(
      from: { x: number; y: number } | undefined,
      to: { x: number; y: number },
    ): Promise<void> {
      if (from !== undefined) {
        await moveAndSettle(from.x, from.y);
      }
      mouseToggle("press", "left");
      await sleep(MOVE_SETTLE_MS);
      try {
        await animatedMove(to.x, to.y, getMouseAnimationEnabled());
      } finally {
        mouseToggle("release", "left");
      }
    },

    async scroll(x: number, y: number, dx: number, dy: number): Promise<void> {
      await moveAndSettle(x, y);
      if (dy !== 0) nativeScrollMouse(Math.abs(dy), dy > 0 ? "down" : "up");
      if (dx !== 0) nativeScrollMouse(Math.abs(dx), dx > 0 ? "right" : "left");
    },

    // ── App management ────────────────────────────────────────────────────

    async getFrontmostApp(): Promise<FrontmostApp | null> {
      const info = nativeGetFrontmostApp();
      if (!info) return null;
      return {
        bundleId: info.bundleId,
        displayName: info.displayName,
      };
    },

    async appUnderPoint(
      x: number,
      y: number,
    ): Promise<{ bundleId: string; displayName: string } | null> {
      const info = nativeGetWindowFromPoint(x, y);
      if (!info) return null;
      return {
        bundleId: info.bundleId,
        displayName: info.displayName,
      };
    },

    async listInstalledApps(): Promise<InstalledApp[]> {
      const visible = listVisibleWindows();
      const seen = new Set<string>();
      const result: InstalledApp[] = [];

      for (const w of visible) {
        if (seen.has(w.bundleId)) continue;
        seen.add(w.bundleId);
        result.push({
          bundleId: w.bundleId,
          displayName: w.displayName,
        });
      }
      return result;
    },

    async getAppIcon(_path: string): Promise<string | undefined> {
      // No icon extraction in standalone mode. The approval dialog
      // falls back to a grey box when undefined.
      return undefined;
    },

    async listRunningApps(): Promise<RunningApp[]> {
      return nativeListRunningApps();
    },

    async openApp(bundleId: string): Promise<void> {
      if (activateWindow(bundleId)) return;
      shellOpen(bundleId);
    },
  };
}
