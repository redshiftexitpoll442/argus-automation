/**
 * Windows platform constants and utilities.
 *
 * Equivalent of src/utils/computerUse/common.ts in the CLI.
 */

/** Bundle IDs (exe names) for Windows sentinel apps — shell-access-equivalent. */
export const WIN_SENTINEL_EXES = new Set([
  "CMD.EXE",
  "POWERSHELL.EXE",
  "PWSH.EXE",
  "WINDOWSTERMINAL.EXE",
  "BASH.EXE",
  "WSL.EXE",
  "EXPLORER.EXE",     // File manager
  "MSTSC.EXE",        // Remote Desktop
  "SYSTEMSETTINGS.EXE", // System Settings (like macOS System Preferences)
]);

/** Browser exes — "read" tier (visible, no interaction). */
export const WIN_BROWSER_EXES = new Set([
  "CHROME.EXE",
  "MSEDGE.EXE",
  "FIREFOX.EXE",
  "BRAVE.EXE",
  "OPERA.EXE",
  "VIVALDI.EXE",
  "IEXPLORE.EXE",
  "APPLICATIONFRAMEHOST.EXE",  // UWP browser wrapper
]);

/** Terminal/IDE exes — "click" tier (visible + click, no typing). */
export const WIN_TERMINAL_EXES = new Set([
  "CMD.EXE",
  "POWERSHELL.EXE",
  "PWSH.EXE",
  "WINDOWSTERMINAL.EXE",
  "BASH.EXE",
  "WSL.EXE",
  "CODE.EXE",          // VS Code
  "DEVENV.EXE",        // Visual Studio
  "IDEA64.EXE",        // IntelliJ
  "PYCHARM64.EXE",     // PyCharm
  "GOLAND64.EXE",      // GoLand
  "RIDER64.EXE",       // JetBrains Rider
  "WEBSTORM64.EXE",    // WebStorm
  "CLION64.EXE",       // CLion
  "SUBLIME_TEXT.EXE",  // Sublime Text
  "NOTEPAD++.EXE",     // Notepad++
]);
