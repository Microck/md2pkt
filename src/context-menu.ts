import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { commandExists, runCommand } from "./run-command";

const extensions = [".md", ".pdf"] as const;

export async function installContextMenu(binPath = "md2pkt"): Promise<string[]> {
  ensureWindows();
  const runnerPath = await installContextMenuRunner(binPath);
  const commands: RegistryCommand[] = [];
  for (const extension of extensions) {
    const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${runnerPath}" "%1"`;
    for (const key of contextMenuKeys(extension)) {
      const commandKey = `${key}\\command`;
      commands.push(regAdd(key, undefined, "Build Packet Tracer .pkt"));
      commands.push(regAdd(key, "MUIVerb", "Build Packet Tracer .pkt"));
      commands.push(regAdd(key, "Icon", "PacketTracer.exe"));
      commands.push(regAdd(key, "Position", "Top"));
      commands.push(regAdd(key, "MultiSelectModel", "Single"));
      commands.push(regAdd(commandKey, undefined, command));
    }
  }

  await runRegCommands(commands);
  return commands.map(command => command.display);
}

export async function removeContextMenu(): Promise<string[]> {
  ensureWindows();
  const commands = extensions.flatMap(extension => contextMenuKeys(extension).map(key => regDelete(key)));
  await runRegCommands(commands, true);
  return commands.map(command => command.display);
}

function ensureWindows(): void {
  if (process.platform !== "win32") {
    throw new Error("Explorer context-menu registration is only available on Windows.");
  }
}

interface RegistryCommand {
  args: string[];
  display: string;
}

async function runRegCommands(commands: RegistryCommand[], ignoreMissing = false): Promise<void> {
  if (!(await commandExists("reg.exe"))) {
    throw new Error("reg.exe is not available.");
  }

  for (const command of commands) {
    const result = await runCommand("reg.exe", command.args);
    if (result.code !== 0 && !ignoreMissing) {
      throw new Error(result.stderr || result.stdout || `Command failed: ${command.display}`);
    }
  }
}

function regAdd(key: string, valueName: string | undefined, value: string): RegistryCommand {
  const args = valueName
    ? ["add", key, "/v", valueName, "/d", value, "/f"]
    : ["add", key, "/ve", "/d", value, "/f"];
  return { args, display: `reg ${args.map(quoteCmdDisplay).join(" ")}` };
}

function regDelete(key: string): RegistryCommand {
  const args = ["delete", key, "/f"];
  return { args, display: `reg ${args.map(quoteCmdDisplay).join(" ")}` };
}

function contextMenuKeys(extension: typeof extensions[number]): string[] {
  return [
    `HKCU\\Software\\Classes\\SystemFileAssociations\\${extension}\\shell\\md2pkt`,
    `HKCU\\Software\\Classes\\${extension}\\shell\\md2pkt`
  ];
}

function quoteCmdDisplay(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

async function installContextMenuRunner(binPath: string): Promise<string> {
  const dir = contextMenuDir();
  await mkdir(dir, { recursive: true });
  const runnerPath = join(dir, "md2pkt-context-menu.ps1");
  await writeFile(runnerPath, contextMenuRunnerScript(binPath), "utf8");
  return runnerPath;
}

function contextMenuRunnerScript(binPath: string): string {
  return [
    "param(",
    "  [Parameter(Mandatory=$true)]",
    "  [string]$InputPath",
    ")",
    "$ErrorActionPreference = 'Stop'",
    "$OutputPath = [System.IO.Path]::ChangeExtension($InputPath, '.pkt')",
    `& ${quotePowerShell(binPath)} build $InputPath --out $OutputPath --engine auto`,
    "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
    "Read-Host 'Press Enter to close'"
  ].join("\n");
}

function contextMenuDir(): string {
  return join(process.env.LOCALAPPDATA ?? process.cwd(), "md2pkt");
}

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
