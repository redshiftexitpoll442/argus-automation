/**
 * Windows application classification for permission tiers.
 *
 * Equivalent of upstream deniedApps.ts but with Windows exe names
 * instead of macOS bundle IDs.
 *
 * Used by the host adapter to determine default permission tiers
 * when the model calls request_access.
 */

import type { CuAppPermTier } from "./upstream/types.js";

/** Browser exes → "read" tier (visible, no interaction). */
const BROWSER_EXES = new Set([
  "CHROME.EXE",
  "MSEDGE.EXE",
  "FIREFOX.EXE",
  "BRAVE.EXE",
  "OPERA.EXE",
  "VIVALDI.EXE",
  "IEXPLORE.EXE",
]);

/** Terminal/IDE exes → "click" tier (visible + click, no typing). */
const TERMINAL_EXES = new Set([
  "CMD.EXE",
  "POWERSHELL.EXE",
  "PWSH.EXE",
  "WINDOWSTERMINAL.EXE",
  "BASH.EXE",
  "WSL.EXE",
  "CODE.EXE",
  "DEVENV.EXE",
  "IDEA64.EXE",
  "PYCHARM64.EXE",
  "GOLAND64.EXE",
  "RIDER64.EXE",
  "WEBSTORM64.EXE",
  "CLION64.EXE",
  "SUBLIME_TEXT.EXE",
  "NOTEPAD++.EXE",
]);

/** Trading/financial exes → "read" tier (no trade execution). */
const TRADING_EXES = new Set([
  "THINKORSWIM.EXE",
  "TRADER WORKSTATION.EXE",
  "TWS.EXE",
  "METATRADER.EXE",
  "METATRADER64.EXE",
]);

/**
 * Get the default permission tier for a Windows application.
 * Returns undefined if no special tier applies (defaults to "full").
 */
export function getWindowsTierForApp(
  exeName: string,
): CuAppPermTier | undefined {
  const upper = exeName.toUpperCase();
  if (BROWSER_EXES.has(upper)) return "read";
  if (TERMINAL_EXES.has(upper)) return "click";
  if (TRADING_EXES.has(upper)) return "read";
  return undefined; // "full" by default
}
