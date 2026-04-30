import { commandExists, runCommand } from "./run-command";

const extensions = [".md", ".pdf"] as const;

export async function installContextMenu(binPath = "md2pkt"): Promise<string[]> {
  ensureWindows();
  const commands: string[] = [];
  for (const extension of extensions) {
    const key = `HKCU\\Software\\Classes\\SystemFileAssociations\\${extension}\\shell\\md2pkt`;
    const commandKey = `${key}\\command`;
    const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& { ${quotePowerShell(binPath)} build '%1' --out ([System.IO.Path]::ChangeExtension('%1', '.pkt')) --engine auto }"`;
    commands.push(`reg add "${key}" /ve /d "Build Packet Tracer .pkt" /f`);
    commands.push(`reg add "${commandKey}" /ve /d "${command.replace(/"/g, '\\"')}" /f`);
  }

  await runRegCommands(commands);
  return commands;
}

export async function removeContextMenu(): Promise<string[]> {
  ensureWindows();
  const commands = extensions.map(extension => `reg delete "HKCU\\Software\\Classes\\SystemFileAssociations\\${extension}\\shell\\md2pkt" /f`);
  await runRegCommands(commands, true);
  return commands;
}

function ensureWindows(): void {
  if (process.platform !== "win32") {
    throw new Error("Explorer context-menu registration is only available on Windows.");
  }
}

async function runRegCommands(commands: string[], ignoreMissing = false): Promise<void> {
  if (!(await commandExists("reg.exe"))) {
    throw new Error("reg.exe is not available.");
  }

  for (const command of commands) {
    const result = await runCommand("cmd.exe", ["/d", "/s", "/c", command]);
    if (result.code !== 0 && !ignoreMissing) {
      throw new Error(result.stderr || result.stdout || `Command failed: ${command}`);
    }
  }
}

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
