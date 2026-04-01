/**
 * Cross-platform Computer Use MCP Server — stdio entry point.
 *
 * Detects the current platform (macOS, Windows, Linux) at startup and
 * loads the corresponding host adapter. Uses dynamic imports so
 * platform-specific native dependencies only load on their target OS.
 *
 * Architecture:
 *   This file → platform detection → createXxxHostAdapter
 *     → createComputerUseMcpServer → StdioServerTransport
 *
 * The MCP server uses the SAME tool schemas and dispatch logic as
 * Anthropic's built-in Chicago MCP. Only the native layer differs.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createComputerUseMcpServer,
} from "./upstream/mcpServer.js";
import type {
  ComputerUseHostAdapter,
  ComputerUseSessionContext,
  AppGrant,
  CuGrantFlags,
  CoordinateMode,
  CuPermissionResponse,
  CuPermissionRequest,
  ScreenshotDims,
} from "./upstream/types.js";
import { DEFAULT_GRANT_FLAGS } from "./upstream/types.js";
import { getLogDir } from "./logger.js";
import { CuLockManager } from "./cu-lock.js";

// ── Platform detection ────────────────────────────────────────────────────

async function createHostAdapter(): Promise<ComputerUseHostAdapter> {
  const platform = process.platform;

  if (platform === "darwin") {
    const { createDarwinHostAdapter } = await import("./host-adapter-darwin.js");
    return createDarwinHostAdapter({ serverName: "argus" });
  }

  if (platform === "win32") {
    const { createWindowsHostAdapter } = await import("./host-adapter.js");
    return createWindowsHostAdapter({ serverName: "argus" });
  }

  // Linux: use Windows adapter pattern (same sub-gates).
  // Future: create a dedicated Linux adapter.
  throw new Error(
    `Unsupported platform: ${platform}. ` +
    `Argus currently supports macOS (darwin) and Windows (win32).`,
  );
}

// ── Session context (auto-approve + CU lock) ──────────────────────────────

function createAutoApproveSessionContext(
  lock: CuLockManager,
): ComputerUseSessionContext {
  let allowedApps: AppGrant[] = [];
  let grantFlags: CuGrantFlags = { ...DEFAULT_GRANT_FLAGS };
  let selectedDisplayId: number | undefined;
  let lastScreenshotDims: ScreenshotDims | undefined;

  return {
    getAllowedApps: () => allowedApps,
    getGrantFlags: () => grantFlags,
    getUserDeniedBundleIds: () => [],
    getSelectedDisplayId: () => selectedDisplayId,
    getLastScreenshotDims: () => lastScreenshotDims,

    onPermissionRequest: async (
      req: CuPermissionRequest,
      _signal: AbortSignal,
    ): Promise<CuPermissionResponse> => {
      const granted: AppGrant[] = req.apps
        .filter((a) => a.resolved && !a.alreadyGranted)
        .map((a) => ({
          bundleId: a.resolved!.bundleId,
          displayName: a.resolved!.displayName,
          grantedAt: Date.now(),
          tier: a.proposedTier,
        }));

      return {
        granted,
        denied: req.apps
          .filter((a) => !a.resolved)
          .map((a) => ({
            bundleId: a.requestedName,
            reason: "not_installed" as const,
          })),
        flags: {
          clipboardRead: req.requestedFlags.clipboardRead ?? false,
          clipboardWrite: req.requestedFlags.clipboardWrite ?? false,
          systemKeyCombos: req.requestedFlags.systemKeyCombos ?? false,
        },
      };
    },

    onAllowedAppsChanged: (apps, flags) => {
      allowedApps = [...apps];
      grantFlags = flags;
    },

    onResolvedDisplayUpdated: (displayId) => {
      selectedDisplayId = displayId;
    },

    onScreenshotCaptured: (dims) => {
      lastScreenshotDims = dims;
    },

    // ── CU Lock — cross-process mutex ───────────────────────────────────
    checkCuLock: () => lock.checkCuLock(),
    acquireCuLock: () => lock.acquireCuLock(),
    formatLockHeldMessage: (holder) => lock.formatLockHeldMessage(holder),
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const adapter = await createHostAdapter();
  const lock = new CuLockManager();

  const coordinateMode: CoordinateMode = "pixels";
  const sessionCtx = createAutoApproveSessionContext(lock);

  const server = createComputerUseMcpServer(
    adapter,
    coordinateMode,
    sessionCtx,
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const platformLabel =
    process.platform === "darwin" ? "macOS" :
    process.platform === "win32" ? "Windows" :
    process.platform;

  adapter.logger.info(
    `Argus Computer Use MCP Server started (${platformLabel}, stdio). Logs → ${getLogDir()}`,
  );

  process.on("SIGINT", async () => {
    lock.release();
    await server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
