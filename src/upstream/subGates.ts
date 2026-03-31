/**
 * RECONSTRUCTED from CuSubGates type definition in types.ts.
 *
 * Original file: @ant/computer-use-mcp/src/subGates.ts
 * Provides preset gate configurations for all-on and all-off states.
 */

import type { CuSubGates } from "./types.js";

export const ALL_SUB_GATES_ON: CuSubGates = {
  pixelValidation: true,
  clipboardPasteMultiline: true,
  mouseAnimation: true,
  hideBeforeAction: true,
  autoTargetDisplay: true,
  clipboardGuard: true,
};

export const ALL_SUB_GATES_OFF: CuSubGates = {
  pixelValidation: false,
  clipboardPasteMultiline: false,
  mouseAnimation: false,
  hideBeforeAction: false,
  autoTargetDisplay: false,
  clipboardGuard: false,
};
