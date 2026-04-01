/**
 * Clipboard module — uses PowerShell for clipboard access.
 *
 * Equivalent of macOS's pbcopy/pbpaste used by the CLI executor.
 * Windows PowerShell's Get-Clipboard/Set-Clipboard is the most reliable
 * cross-version clipboard access without native dependencies.
 */

import { spawn } from "node:child_process";

const POWERSHELL = "powershell.exe";
const PS_ARGS = ["-NoProfile", "-NonInteractive", "-Command"];

/**
 * Run a PowerShell command, optionally piping stdin. Returns stdout.
 */
function runPowerShell(
  command: string,
  stdin?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(POWERSHELL, [...PS_ARGS, command], {
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
        reject(new Error(`PowerShell exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", reject);

    if (stdin !== undefined) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }
  });
}

/**
 * Read text from the Windows clipboard.
 */
export async function readClipboard(): Promise<string> {
  const stdout = await runPowerShell("Get-Clipboard");
  // PowerShell appends a trailing newline; strip it
  return stdout.replace(/\r?\n$/, "");
}

/**
 * Write text to the Windows clipboard.
 */
export async function writeClipboard(text: string): Promise<void> {
  // Use stdin pipe to avoid escaping issues with special characters
  await runPowerShell("$input | Set-Clipboard", text);
}
