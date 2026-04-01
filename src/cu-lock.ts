/**
 * Cross-process CU lock using O_EXCL file creation.
 *
 * The upstream code (mcpServer.ts, toolCalls.ts) has full lock support:
 *   - checkCuLock() → { holder, isSelf }
 *   - acquireCuLock() → take the lock
 *   - formatLockHeldMessage() → custom error text
 *
 * This module provides the file-based primitive. Same pattern as
 * the CLI's O_EXCL lock referenced in upstream comments.
 *
 * Lock file: <log_dir>/cu.lock
 * Contents: JSON with { holder: string, pid: number, ts: number }
 */

import {
  openSync,
  closeSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// ── Lock file location ────────────────────────────────────────────────────

function getLockDir(): string {
  if (process.platform === "win32") {
    return join(
      process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? ".", ".local"),
      "argus-automation",
    );
  }
  if (process.platform === "darwin") {
    return join(
      process.env.HOME ?? "/tmp",
      "Library",
      "Application Support",
      "argus-automation",
    );
  }
  // Linux
  return join(
    process.env.XDG_STATE_HOME ?? join(process.env.HOME ?? "/tmp", ".local", "state"),
    "argus-automation",
  );
}

function getLockFilePath(): string {
  return join(getLockDir(), "cu.lock");
}

// ── Lock file content ──────────────────────────────────────────────────────

interface LockContent {
  holder: string;
  pid: number;
  ts: number;
}

// ── Stale lock detection ───────────────────────────────────────────────────

/**
 * Check if a PID is still alive.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = test existence
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and validate the lock file. Returns null if no valid lock exists.
 */
function readLock(): LockContent | null {
  const lockPath = getLockFilePath();
  try {
    const raw = readFileSync(lockPath, "utf-8");
    const content = JSON.parse(raw) as LockContent;

    // Check if the holder process is still alive
    if (!isProcessAlive(content.pid)) {
      // Stale lock — holder died without cleanup. Remove it.
      try { unlinkSync(lockPath); } catch { /* race ok */ }
      return null;
    }

    return content;
  } catch {
    return null;
  }
}

// ── CuLockManager ──────────────────────────────────────────────────────────

export class CuLockManager {
  private readonly sessionId: string;
  private held = false;

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? `argus-${randomUUID().slice(0, 8)}`;
    this.setupCleanup();
  }

  /**
   * Check who holds the lock.
   * Wired to ComputerUseSessionContext.checkCuLock.
   */
  async checkCuLock(): Promise<{ holder: string | undefined; isSelf: boolean }> {
    if (this.held) {
      return { holder: this.sessionId, isSelf: true };
    }

    const lock = readLock();
    if (!lock) {
      return { holder: undefined, isSelf: false };
    }

    return {
      holder: lock.holder,
      isSelf: lock.holder === this.sessionId,
    };
  }

  /**
   * Acquire the lock. Uses O_EXCL for atomic creation.
   * Wired to ComputerUseSessionContext.acquireCuLock.
   */
  async acquireCuLock(): Promise<void> {
    if (this.held) return; // already held

    const lockPath = getLockFilePath();
    const lockDir = getLockDir();

    // Ensure directory exists
    if (!existsSync(lockDir)) {
      mkdirSync(lockDir, { recursive: true });
    }

    // Check for stale lock first
    const existing = readLock();
    if (existing && existing.holder !== this.sessionId) {
      throw new Error(
        `CU lock held by ${existing.holder} (pid ${existing.pid})`,
      );
    }

    // If stale lock was cleaned up, or no lock exists, create new one
    const content: LockContent = {
      holder: this.sessionId,
      pid: process.pid,
      ts: Date.now(),
    };

    try {
      // O_EXCL: fail if file already exists (atomic create-only)
      // O_CREAT: create the file  |  O_WRONLY: write-only
      // Node's fs constants: 0x80 (O_EXCL) | 0x100 (O_CREAT) | 0x1 (O_WRONLY)
      const fd = openSync(lockPath, "wx"); // 'wx' = O_CREAT | O_EXCL | O_WRONLY
      try {
        const buf = Buffer.from(JSON.stringify(content, null, 2));
        writeFileSync(fd, buf);
      } finally {
        closeSync(fd);
      }
      this.held = true;
    } catch (err: any) {
      if (err?.code === "EEXIST") {
        // Another process grabbed the lock between our check and create.
        // Re-read to see who won.
        const winner = readLock();
        if (winner && winner.holder !== this.sessionId) {
          throw new Error(
            `CU lock held by ${winner.holder} (pid ${winner.pid})`,
          );
        }
        // Stale lock from a dead process — clean up and retry once
        try { unlinkSync(lockPath); } catch { /* race ok */ }
        return this.acquireCuLock();
      }
      throw err;
    }
  }

  /**
   * Release the lock. Called on process exit.
   */
  release(): void {
    if (!this.held) return;

    try {
      const lockPath = getLockFilePath();
      const current = readLock();
      // Only delete if we're the holder (don't delete another session's lock)
      if (current && current.holder === this.sessionId) {
        unlinkSync(lockPath);
      }
    } catch {
      // best-effort
    }
    this.held = false;
  }

  /**
   * Custom error message including the session ID.
   * Wired to ComputerUseSessionContext.formatLockHeldMessage.
   */
  formatLockHeldMessage(holder: string): string {
    return (
      `Another argus session (${holder}) is currently using the computer. ` +
      `Wait for that session to finish, or stop it before starting a new one.`
    );
  }

  /**
   * Register cleanup handlers so the lock is released on exit.
   */
  private setupCleanup(): void {
    const cleanup = () => this.release();

    process.on("exit", cleanup);
    process.on("SIGINT", () => { cleanup(); process.exit(0); });
    process.on("SIGTERM", () => { cleanup(); process.exit(0); });

    // Windows: handle Ctrl+C
    if (process.platform === "win32") {
      process.on("SIGHUP", () => { cleanup(); process.exit(0); });
    }
  }
}
