/**
 * RECONSTRUCTED from CLI executor implementation + toolCalls.ts usage patterns.
 *
 * Original file: @ant/computer-use-mcp/src/executor.ts
 * This file was not included in the source-map extraction. The interface is
 * reconstructed with 100% accuracy from:
 *   - CLI executor.ts (659 lines) — implements every method
 *   - toolCalls.ts (3,649 lines) — calls every method, reveals arg/return types
 *   - index.ts — lists all exported types
 *   - types.ts — imports ScreenshotResult, InstalledApp, ComputerExecutor
 */

// ── Result types ────────────────────────────────────────────────────────────

export interface ScreenshotResult {
  base64: string;
  width: number;
  height: number;
  /** Logical display width at capture time (for scaleCoord). */
  displayWidth: number;
  /** Logical display height at capture time. */
  displayHeight: number;
  /** Which physical display this was captured from. */
  displayId: number;
  /** Display origin X (multi-monitor offset). */
  originX: number;
  /** Display origin Y. */
  originY: number;
}

export interface DisplayGeometry {
  displayId: number;
  /** Human-readable label, e.g. "Dell U2720Q". May be undefined on some platforms. */
  label?: string;
  /** Logical width in points. */
  width: number;
  /** Logical height in points. */
  height: number;
  originX: number;
  originY: number;
  /** DPI scale factor (e.g. 2.0 for Retina, 1.25/1.5 for Windows HiDPI). */
  scaleFactor: number;
  isPrimary: boolean;
}

export interface InstalledApp {
  bundleId: string;
  displayName: string;
  path?: string;
  /** Lazily populated via getAppIcon(). */
  iconDataUrl?: string;
}

export interface RunningApp {
  bundleId: string;
  displayName: string;
}

export interface FrontmostApp {
  bundleId: string;
  displayName: string;
}

/**
 * Result of the atomic resolve→prepare→capture path. Extends ScreenshotResult
 * with hide-set info and an optional capture error for partial-success cases
 * (hide succeeded, capture failed).
 */
export interface ResolvePrepareCaptureResult extends ScreenshotResult {
  /** Bundle IDs that were hidden during the prepare step. */
  hidden: string[];
  /** If capture failed after hide, this contains the error message. base64 is empty. */
  captureError?: string;
}

// ── Executor interface ──────────────────────────────────────────────────────

export interface ComputerExecutor {
  capabilities: {
    /**
     * 'native' — compositor-level window filtering (macOS SCContentFilter).
     * 'none' — screenshots capture everything (Windows). The upper layer
     * adjusts tool descriptions and security gates accordingly.
     */
    screenshotFiltering: "native" | "none";
    platform: "darwin" | "win32";
    /** Bundle ID of the host app (for frontmost gate exemption). */
    hostBundleId: string;
    /** Whether teach-mode tools are available. */
    teachMode?: boolean;
  };

  // ── Pre-action sequence ─────────────────────────────────────────────────

  /**
   * Hide non-allowlisted apps, defocus the host. Returns bundle IDs of
   * apps that were hidden. Sub-gated by hideBeforeAction.
   */
  prepareForAction(
    allowlistBundleIds: string[],
    displayId?: number,
  ): Promise<string[]>;

  /**
   * Preview which apps would be hidden by prepareForAction, without
   * actually hiding them. Used for the approval dialog's "will hide" list.
   */
  previewHideSet(
    allowlistBundleIds: string[],
    displayId?: number,
  ): Promise<Array<{ bundleId: string; displayName: string }>>;

  // ── Display ─────────────────────────────────────────────────────────────

  getDisplaySize(displayId?: number): Promise<DisplayGeometry>;
  listDisplays(): Promise<DisplayGeometry[]>;

  /**
   * For each bundle ID, find which display(s) have windows for that app.
   */
  findWindowDisplays(
    bundleIds: string[],
  ): Promise<Array<{ bundleId: string; displayIds: number[] }>>;

  /**
   * Atomic resolve→prepare→capture. Resolves the best display for the
   * allowed apps, optionally hides non-allowlisted apps, and captures
   * a screenshot — all in one call to avoid scheduler gaps.
   */
  resolvePrepareCapture(opts: {
    allowedBundleIds: string[];
    preferredDisplayId?: number;
    autoResolve: boolean;
    doHide?: boolean;
  }): Promise<ResolvePrepareCaptureResult>;

  // ── Screenshot ──────────────────────────────────────────────────────────

  screenshot(opts: {
    allowedBundleIds: string[];
    displayId?: number;
  }): Promise<ScreenshotResult>;

  /**
   * Capture a region at higher resolution. Coordinates are in the logical
   * space of the last full-screen screenshot.
   */
  zoom(
    regionLogical: { x: number; y: number; w: number; h: number },
    allowedBundleIds: string[],
    displayId?: number,
  ): Promise<{ base64: string; width: number; height: number }>;

  // ── Keyboard ────────────────────────────────────────────────────────────

  /**
   * Press a key or key combo (xdotool syntax: "ctrl+shift+a").
   * @param repeat — number of times to repeat (default 1).
   */
  key(keySequence: string, repeat?: number): Promise<void>;

  /**
   * Press and hold keys for a duration, then release.
   * @param durationMs — hold duration in milliseconds.
   */
  holdKey(keyNames: string[], durationMs: number): Promise<void>;

  /**
   * Type text. When viaClipboard is true, uses clipboard paste (fast path
   * for multi-line). When false, types character-by-character.
   */
  type(text: string, opts: { viaClipboard: boolean }): Promise<void>;

  // ── Clipboard ───────────────────────────────────────────────────────────

  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<void>;

  // ── Mouse ───────────────────────────────────────────────────────────────

  moveMouse(x: number, y: number): Promise<void>;

  click(
    x: number,
    y: number,
    button: "left" | "right" | "middle",
    count: 1 | 2 | 3,
    modifiers?: string[],
  ): Promise<void>;

  mouseDown(): Promise<void>;
  mouseUp(): Promise<void>;
  getCursorPosition(): Promise<{ x: number; y: number }>;

  /**
   * Drag from `from` to `to`. If `from` is undefined, drags from the
   * current cursor position.
   */
  drag(
    from: { x: number; y: number } | undefined,
    to: { x: number; y: number },
  ): Promise<void>;

  /**
   * Scroll at (x, y). dy > 0 = scroll down, dy < 0 = scroll up.
   * dx > 0 = scroll right, dx < 0 = scroll left.
   */
  scroll(x: number, y: number, dx: number, dy: number): Promise<void>;

  // ── App management ──────────────────────────────────────────────────────

  getFrontmostApp(): Promise<FrontmostApp | null>;

  appUnderPoint(
    x: number,
    y: number,
  ): Promise<{ bundleId: string; displayName: string } | null>;

  listInstalledApps(): Promise<InstalledApp[]>;

  /**
   * Get app icon as a data URL. Used by the approval dialog.
   */
  getAppIcon(path: string): Promise<string | undefined>;

  listRunningApps(): Promise<RunningApp[]>;

  openApp(bundleId: string): Promise<void>;
}
