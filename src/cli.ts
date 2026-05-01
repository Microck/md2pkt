#!/usr/bin/env node
import { Command } from "commander";
import { buildPkt } from "./build";
import { installBridgeBootstrap, repairBridge, getBridgeStatus, bridgeBootstrapScript } from "./bridge";
import { installContextMenu, removeContextMenu } from "./context-menu";
import { runDoctor } from "./doctor";
import { buildEngineSchema, type BuildEngine } from "./topology-schema";

const program = new Command();

program
  .name("md2pkt")
  .description("Convert Markdown or text-based PDF network instructions into Cisco Packet Tracer .pkt files.")
  .version("0.1.1");

program
  .command("build")
  .argument("<file>", "Markdown, text, or text-based PDF instruction file")
  .requiredOption("--out <file>", "Packet Tracer .pkt output path")
  .option("--engine <engine>", "Planning engine: auto, codex, or api", "auto")
  .action(async (file: string, options: { out: string; engine: string }) => {
    const engine = parseEngine(options.engine);
    const artifacts = await buildPkt(file, { out: options.out, engine });
    process.stdout.write(artifacts.report);
    process.stdout.write(`\nQueued build for ${options.out}\n`);
  });

program
  .command("doctor")
  .description("Check local prerequisites and bridge status.")
  .action(async () => {
    const checks = await runDoctor();
    for (const check of checks) {
      process.stdout.write(`${check.ok ? "ok" : "fail"} ${check.name}: ${check.detail}\n`);
    }
    if (checks.some(check => !check.ok)) {
      process.exitCode = 1;
    }
  });

const bridge = program.command("bridge").description("Manage the Packet Tracer PTBuilder bridge.");

bridge
  .command("install")
  .description("Write the PTBuilder bootstrap script and show manual Packet Tracer setup instructions.")
  .action(async () => {
    const path = await installBridgeBootstrap();
    process.stdout.write(`Wrote ${path}\n\nPaste this into Packet Tracer Extensions -> Builder Code Editor and run it:\n\n${bridgeBootstrapScript()}`);
  });

bridge
  .command("status")
  .description("Check the PTBuilder bridge.")
  .action(async () => {
    const status = await getBridgeStatus();
    process.stdout.write(`${status.ok ? "ok" : "fail"} ${status.url}: ${status.detail}\n`);
    if (!status.ok) process.exitCode = 1;
  });

bridge
  .command("repair")
  .description("Rewrite the PTBuilder bootstrap script.")
  .action(async () => {
    const path = await repairBridge();
    process.stdout.write(`Rewrote ${path}\n`);
  });

const contextMenu = program.command("context-menu").description("Manage Windows Explorer right-click entries.");

contextMenu
  .command("install")
  .description("Register Explorer right-click actions for .md and .pdf files.")
  .action(async () => {
    const commands = await installContextMenu();
    process.stdout.write(`Installed context menu entries:\n${commands.join("\n")}\n`);
  });

contextMenu
  .command("remove")
  .description("Remove Explorer right-click actions for .md and .pdf files.")
  .action(async () => {
    const commands = await removeContextMenu();
    process.stdout.write(`Removed context menu entries:\n${commands.join("\n")}\n`);
  });

program.parseAsync(process.argv).catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

function parseEngine(value: string): BuildEngine {
  const parsed = buildEngineSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid engine "${value}". Use auto, codex, or api.`);
  }
  return parsed.data;
}
