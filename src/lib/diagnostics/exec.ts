import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";

export async function runCommand(
  command: string,
  args: string[],
  timeoutMs = 8000,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: stdout?.toString() ?? "",
          stderr: stderr?.toString() ?? (error ? error.message : ""),
        });
      },
    );
  });
}

export async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
