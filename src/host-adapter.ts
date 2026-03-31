/**
 * ComputerUseHostAdapter for Windows — assembles executor + gates + logger
 * into the adapter consumed by upstream mcpServer.ts.
 *
 * Mirrors apps/desktop/src/main/nest-only/chicago/hostAdapter.ts.
 */

import type {
  ComputerUseHostAdapter,
  CuSubGates,
  Logger,
} from "./upstream/types.js";
import { ALL_SUB_GATES_ON } from "./upstream/subGates.js";
import { createWindowsExecutor } from "./executor-windows.js";
import { cropRawPatch } from "./native/screen.js";

/**
 * Default sub-gates for Windows. Most gates are ON; a few are adapted:
 * - autoTargetDisplay: OFF (Windows doesn't have the atomic Swift resolver)
 * - clipboardGuard: OFF (no Electron clipboard module to stash)
 */
const WIN_DEFAULT_SUB_GATES: CuSubGates = {
  ...ALL_SUB_GATES_ON,
  autoTargetDisplay: false,
  clipboardGuard: false,
};

export interface WindowsHostAdapterOpts {
  serverName?: string;
  logger?: Logger;
  subGates?: Partial<CuSubGates>;
}

/**
 * Create the Windows host adapter.
 */
export function createWindowsHostAdapter(
  opts: WindowsHostAdapterOpts = {},
): ComputerUseHostAdapter {
  const serverName = opts.serverName ?? "windows-computer-use";
  const logger: Logger = opts.logger ?? {
    info: (...args: unknown[]) =>
      console.error(`[${serverName}] INFO`, ...args),
    error: (...args: unknown[]) =>
      console.error(`[${serverName}] ERROR`, ...args),
    warn: (...args: unknown[]) =>
      console.error(`[${serverName}] WARN`, ...args),
    debug: (...args: unknown[]) =>
      console.error(`[${serverName}] DEBUG`, ...args),
    silly: () => {},
  };

  const subGates: CuSubGates = {
    ...WIN_DEFAULT_SUB_GATES,
    ...opts.subGates,
  };

  const executor = createWindowsExecutor({
    getMouseAnimationEnabled: () => subGates.mouseAnimation,
    getHideBeforeActionEnabled: () => subGates.hideBeforeAction,
  });

  return {
    serverName,
    logger,
    executor,

    // Windows doesn't need TCC permissions — always granted
    async ensureOsPermissions() {
      return { granted: true as const };
    },

    // Not disabled by default
    isDisabled() {
      return false;
    },

    // Auto-unhide at turn end
    getAutoUnhideEnabled() {
      return true;
    },

    // Sub-gates
    getSubGates() {
      return subGates;
    },

    // Pixel validation: crop JPEG → raw bytes via sharp
    cropRawPatch(
      jpegBase64: string,
      rect: { x: number; y: number; width: number; height: number },
    ): Buffer | null {
      // cropRawPatch is async but the interface expects sync.
      // Use a blocking workaround for the pixel validation path.
      // The upstream code treats null as "skipped" — validation failure
      // must never block an action. For the initial implementation,
      // we return null (skip validation) and plan to add async support.
      //
      // TODO: Implement sync crop via sharp's pipeline or switch to
      // nativeImage equivalent.
      return null;
    },
  };
}
