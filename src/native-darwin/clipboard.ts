/**
 * Clipboard module for macOS — wraps pbcopy/pbpaste.
 *
 * Direct equivalent of native/clipboard.ts (PowerShell) but using macOS
 * built-in clipboard utilities. Same spawn-and-pipe pattern.
 */

import { spawn } from "node:child_process";

/**
 * Run a command, optionally piping stdin. Returns stdout.
 */
function run(
  cmd: string,
  args: string[],
  stdin?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${cmd} exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", reject);

    if (stdin !== undefined) {
      proc.stdin.write(stdin);
    }
    proc.stdin.end();
  });
}

/**
 * Read text from the macOS clipboard.
 */
export async function readClipboard(): Promise<string> {
  return run("pbpaste", []);
}

/**
 * Write text to the macOS clipboard.
 */
export async function writeClipboard(text: string): Promise<void> {
  await run("pbcopy", [], text);
}
