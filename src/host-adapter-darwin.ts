/**
 * ComputerUseHostAdapter for macOS.
 *
 * Key differences from Windows adapter:
 *   - ensureOsPermissions() checks real TCC state (Accessibility + Screen Recording)
 *   - hideBeforeAction: true (macOS compositor hiding is safe, unlike Windows minimize)
 *   - pixelValidation: false (still async sharp issue, same as Windows)
 *   - FINDER_BUNDLE_ID matches upstream — no workaround needed
 */

import { execFileSync } from "node:child_process";
import type {
  ComputerUseHostAdapter,
  CuSubGates,
  Logger,
} from "./upstream/types.js";
import { ALL_SUB_GATES_ON } from "./upstream/subGates.js";
import { createDarwinExecutor } from "./executor-darwin.js";
import { createFileLogger } from "./logger.js";

/**
 * Default sub-gates for macOS. More features enabled than Windows because
 * macOS has compositor-level window management.
 */
const DARWIN_DEFAULT_SUB_GATES: CuSubGates = {
  ...ALL_SUB_GATES_ON,
  pixelValidation: false,     // cropRawPatch sync interface vs sharp async — same issue
  autoTargetDisplay: false,   // needs atomic Swift resolver (future)
  clipboardGuard: false,      // no Electron clipboard module
  // hideBeforeAction: true   — inherited from ALL_SUB_GATES_ON. Safe on macOS.
  // mouseAnimation: true     — inherited from ALL_SUB_GATES_ON.
};

// ── TCC permission checks ──────────────────────────────────────────────────

/**
 * Check if Accessibility permission is granted by trying to use System Events.
 */
function checkAccessibility(): boolean {
  try {
    execFileSync(
      "osascript",
      ["-l", "JavaScript", "-e", 'Application("System Events").processes[0].name()'],
      { encoding: "utf-8", timeout: 3000, stdio: "pipe" },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Screen Recording permission is granted.
 * Uses `CGPreflightScreenCaptureAccess` via a Swift snippet, falling back
 * to optimistic true if Swift is unavailable.
 */
function checkScreenRecording(): boolean {
  try {
    // On macOS 15+, CGPreflightScreenCaptureAccess is the correct check.
    // On older versions, we try a test screenshot and check if it's blank.
    const result = execFileSync(
      "swift",
      ["-e", `
        import CoreGraphics
        if #available(macOS 15, *) {
          print(CGPreflightScreenCaptureAccess())
        } else {
          // Pre-15: try capturing a tiny region. If denied, returns nil.
          let img = CGWindowListCreateImage(
            CGRect(x: 0, y: 0, width: 1, height: 1),
            .optionOnScreenOnly, kCGNullWindowID, .bestResolution
          )
          print(img != nil)
        }
      `],
      { encoding: "utf-8", timeout: 5000, stdio: "pipe" },
    ).trim();
    return result === "true";
  } catch {
    // If swift is not available or fails, assume granted.
    // The user will see a blank screenshot if it's actually denied.
    return true;
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

export interface DarwinHostAdapterOpts {
  serverName?: string;
  logger?: Logger;
  subGates?: Partial<CuSubGates>;
}

/**
 * Create the macOS host adapter.
 */
export function createDarwinHostAdapter(
  opts: DarwinHostAdapterOpts = {},
): ComputerUseHostAdapter {
  const serverName = opts.serverName ?? "argus";
  const logger: Logger = opts.logger ?? createFileLogger(serverName);

  const subGates: CuSubGates = {
    ...DARWIN_DEFAULT_SUB_GATES,
    ...opts.subGates,
  };

  const executor = createDarwinExecutor({
    getMouseAnimationEnabled: () => subGates.mouseAnimation,
    getHideBeforeActionEnabled: () => subGates.hideBeforeAction,
  });

  return {
    serverName,
    logger,
    executor,

    // macOS TCC — real permission checks
    async ensureOsPermissions() {
      const accessibility = checkAccessibility();
      const screenRecording = checkScreenRecording();

      if (accessibility && screenRecording) {
        return { granted: true as const };
      }

      return {
        granted: false as const,
        accessibility,
        screenRecording,
      };
    },

    isDisabled() {
      return false;
    },

    getAutoUnhideEnabled() {
      return true;
    },

    getSubGates() {
      return subGates;
    },

    // Pixel validation: same async issue as Windows
    cropRawPatch(
      _jpegBase64: string,
      _rect: { x: number; y: number; width: number; height: number },
    ): Buffer | null {
      throw new Error("cropRawPatch not implemented (sync); skipping pixel validation");
    },
  };
}
