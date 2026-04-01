/**
 * Window management module for macOS — wraps JXA (JavaScript for Automation)
 * via osascript and node-screenshots.
 *
 * The upstream code was originally written for macOS. Bundle IDs here are
 * real CFBundleIdentifiers (e.g. "com.apple.Safari"), matching what
 * upstream/deniedApps.ts and upstream/sentinelApps.ts expect.
 *
 * Performance: each osascript spawn is ~30-50ms. Hot paths (getFrontmostApp)
 * are cached with a short TTL.
 */

import { execFileSync, execFile } from "node:child_process";
import { Window as NsWindow } from "node-screenshots";

// ── JXA helper ─────────────────────────────────────────────────────────────

/**
 * Execute a JXA (JavaScript for Automation) script and return parsed JSON.
 * Throws on non-zero exit or parse failure.
 */
function jxa<T>(script: string): T {
  const stdout = execFileSync(
    "osascript",
    ["-l", "JavaScript", "-e", script],
    { encoding: "utf-8", timeout: 5000 },
  ).trim();
  return JSON.parse(stdout) as T;
}

/**
 * Fire-and-forget JXA — no return value, no waiting for completion.
 */
function jxaVoid(script: string): void {
  execFileSync("osascript", ["-l", "JavaScript", "-e", script], {
    encoding: "utf-8",
    timeout: 5000,
  });
}

// ── Frontmost cache ────────────────────────────────────────────────────────
// getFrontmostApp is called on every input action by the upstream frontmost
// gate. Caching avoids ~50ms osascript spawn per click/type/key.

interface CachedFrontmost {
  bundleId: string;
  displayName: string;
  ts: number;
}

let frontmostCache: CachedFrontmost | undefined;
const FRONTMOST_CACHE_TTL_MS = 100;

function invalidateFrontmostCache(): void {
  frontmostCache = undefined;
}

// ── Window info type ────────────────────────────────────────────────────────

export interface DarwinWindowInfo {
  bundleId: string;
  displayName: string;
  pid: number;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the frontmost (active) application's bundle ID and display name.
 */
export function getFrontmostApp(): DarwinWindowInfo | null {
  // Check cache
  if (frontmostCache && Date.now() - frontmostCache.ts < FRONTMOST_CACHE_TTL_MS) {
    return { ...frontmostCache, pid: 0 };
  }

  try {
    const result = jxa<{ bundleId: string; name: string; pid: number }>(`
      const se = Application("System Events");
      const ps = se.processes.whose({frontmost: true});
      if (ps.length === 0) { JSON.stringify(null); }
      else {
        const p = ps[0];
        JSON.stringify({
          bundleId: p.bundleIdentifier(),
          name: p.displayedName(),
          pid: p.unixId()
        });
      }
    `);

    if (!result) return null;

    frontmostCache = {
      bundleId: result.bundleId,
      displayName: result.name,
      ts: Date.now(),
    };

    return {
      bundleId: result.bundleId,
      displayName: result.name,
      pid: result.pid,
    };
  } catch {
    return null;
  }
}

/**
 * Get the application under a screen point.
 *
 * Uses node-screenshots Window.all() for window bounds, checks point
 * containment in JS. Falls back to frontmost if no match.
 */
export function getWindowFromPoint(
  x: number,
  y: number,
): DarwinWindowInfo | null {
  try {
    const nsWindows = NsWindow.all();
    for (const w of nsWindows) {
      if (w.isMinimized()) continue;
      const wx = w.x();
      const wy = w.y();
      const ww = w.width();
      const wh = w.height();
      if (x >= wx && x < wx + ww && y >= wy && y < wy + wh) {
        // Found the window at this point — get its bundle ID
        const pid = w.pid();
        const info = getBundleIdForPid(pid);
        if (info) return { ...info, pid };
      }
    }
    // Fallback to frontmost
    return getFrontmostApp();
  } catch {
    return getFrontmostApp();
  }
}

/**
 * Get bundle ID and display name for a PID via System Events.
 */
function getBundleIdForPid(pid: number): { bundleId: string; displayName: string } | null {
  try {
    return jxa<{ bundleId: string; displayName: string }>(`
      const se = Application("System Events");
      const ps = se.processes.whose({unixId: ${pid}});
      if (ps.length === 0) JSON.stringify(null);
      else {
        const p = ps[0];
        JSON.stringify({
          bundleId: p.bundleIdentifier(),
          displayName: p.displayedName()
        });
      }
    `);
  } catch {
    return null;
  }
}

/**
 * List all running GUI applications (deduped by bundle ID).
 */
export function listRunningApps(): Array<{
  bundleId: string;
  displayName: string;
}> {
  try {
    return jxa<Array<{ bundleId: string; displayName: string }>>(`
      const se = Application("System Events");
      const ps = se.applicationProcesses();
      const seen = {};
      const result = [];
      for (let i = 0; i < ps.length; i++) {
        const bid = ps[i].bundleIdentifier();
        if (!bid || seen[bid]) continue;
        seen[bid] = true;
        result.push({ bundleId: bid, displayName: ps[i].displayedName() });
      }
      JSON.stringify(result);
    `);
  } catch {
    return [];
  }
}

/**
 * List visible (non-minimized) windows, deduped by bundle ID.
 */
export function listVisibleWindows(): DarwinWindowInfo[] {
  try {
    const nsWindows = NsWindow.all();
    const seen = new Set<number>();
    const results: DarwinWindowInfo[] = [];

    for (const w of nsWindows) {
      if (w.isMinimized()) continue;
      const pid = w.pid();
      if (seen.has(pid)) continue;
      seen.add(pid);

      const info = getBundleIdForPid(pid);
      if (!info) continue;

      results.push({ ...info, pid });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Hide applications by bundle ID (set visible = false).
 * Unlike Windows minimize, macOS hiding is compositor-level and doesn't
 * break child processes.
 */
export function hideWindows(bundleIds: string[]): void {
  invalidateFrontmostCache();
  const ids = JSON.stringify(bundleIds);
  try {
    jxaVoid(`
      const se = Application("System Events");
      const targets = ${ids};
      for (const bid of targets) {
        const ps = se.processes.whose({bundleIdentifier: bid});
        if (ps.length > 0) ps[0].visible = false;
      }
    `);
  } catch {
    // best-effort
  }
}

/**
 * Unhide (show) applications by bundle ID.
 */
export function unhideWindows(bundleIds: string[]): void {
  invalidateFrontmostCache();
  const ids = JSON.stringify(bundleIds);
  try {
    jxaVoid(`
      const se = Application("System Events");
      const targets = ${ids};
      for (const bid of targets) {
        const ps = se.processes.whose({bundleIdentifier: bid});
        if (ps.length > 0) ps[0].visible = true;
      }
    `);
  } catch {
    // best-effort
  }
}

/**
 * Activate (bring to front) an application by bundle ID.
 * Returns true if successfully activated.
 */
export function activateWindow(bundleId: string): boolean {
  invalidateFrontmostCache();
  try {
    const result = jxa<boolean>(`
      const se = Application("System Events");
      const ps = se.processes.whose({bundleIdentifier: "${bundleId}"});
      if (ps.length === 0) {
        JSON.stringify(false);
      } else {
        ps[0].frontmost = true;
        JSON.stringify(true);
      }
    `);
    return result;
  } catch {
    return false;
  }
}

/**
 * Open/launch an application by bundle ID.
 */
export function shellOpen(bundleId: string): void {
  try {
    // `open -b <bundleId>` launches by bundle identifier
    execFileSync("open", ["-b", bundleId], { timeout: 5000 });
  } catch {
    // Fallback: try as a path or app name
    try {
      execFileSync("open", ["-a", bundleId], { timeout: 5000 });
    } catch {
      // best-effort
    }
  }
}

/**
 * Find which monitors have windows for given bundle IDs.
 * Uses node-screenshots Window.all() + currentMonitor().
 */
export function findWindowDisplays(
  bundleIds: string[],
): Array<{ bundleId: string; displayIds: number[] }> {
  const targets = new Set(bundleIds);
  const result = new Map<string, Set<number>>();

  try {
    // Build PID → bundleId map
    const pidMap = new Map<number, string>();
    const apps = listRunningApps();
    const nsWindows = NsWindow.all();

    // Match PIDs to bundle IDs via visible windows
    for (const w of nsWindows) {
      if (w.isMinimized()) continue;
      const pid = w.pid();
      if (pidMap.has(pid)) continue;

      const info = getBundleIdForPid(pid);
      if (info && targets.has(info.bundleId)) {
        pidMap.set(pid, info.bundleId);
      }
    }

    // Map windows to displays
    for (const w of nsWindows) {
      if (w.isMinimized()) continue;
      const bid = pidMap.get(w.pid());
      if (!bid) continue;

      const monitor = w.currentMonitor();
      const displayId = monitor.id();

      if (!result.has(bid)) result.set(bid, new Set());
      result.get(bid)!.add(displayId);
    }
  } catch {
    // best-effort
  }

  return Array.from(result.entries()).map(([bundleId, ids]) => ({
    bundleId,
    displayIds: Array.from(ids),
  }));
}
