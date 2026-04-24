import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

function resolveScreenshotDir(): string {
  if (process.platform === "win32") {
    return join(
      process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? ".", ".local"),
      "argus-automation",
      "codex-screenshots",
    );
  }

  return join(
    process.env.XDG_STATE_HOME ?? join(process.env.HOME ?? "/tmp", ".local", "state"),
    "argus-automation",
    "codex-screenshots",
  );
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function saveScreenshotBase64(
  base64: string,
  tag: string = "observe",
): Promise<string> {
  const dir = resolveScreenshotDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const filename = `${tag}_${timestampForFilename()}.jpg`;
  const filePath = join(dir, filename);
  await writeFile(filePath, Buffer.from(base64, "base64"));
  return filePath;
}

