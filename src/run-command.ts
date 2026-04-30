import { spawn } from "node:child_process";

export interface CommandResult {
  command: string;
  args: string[];
  code: number | null;
  stdout: string;
  stderr: string;
}

export function runCommand(command: string, args: string[], input?: string, timeoutMs = 120_000): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", code => {
      clearTimeout(timer);
      resolve({ command, args, code, stdout, stderr });
    });

    if (input) {
      child.stdin.end(input);
    } else {
      child.stdin.end();
    }
  });
}

export async function commandExists(command: string): Promise<boolean> {
  const probe = process.platform === "win32"
    ? await runCommand("where.exe", [command], undefined, 10_000).catch(() => undefined)
    : await runCommand("sh", ["-c", `command -v ${shellQuote(command)}`], undefined, 10_000).catch(() => undefined);
  return probe?.code === 0;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
