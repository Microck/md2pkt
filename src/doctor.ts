import { access } from "node:fs/promises";
import { join } from "node:path";
import { commandExists } from "./run-command";
import { getBridgeStatus } from "./bridge";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runDoctor(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  checks.push({
    name: "Node.js",
    ok: Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) >= 20,
    detail: process.version
  });

  checks.push({
    name: "Codex CLI",
    ok: await commandExists("codex"),
    detail: (await commandExists("codex")) ? "available" : "not found; auto mode will use API or deterministic inference"
  });

  const hasMarkItDown = await commandExists("markitdown");
  const hasMarkit = await commandExists("markit");
  checks.push({
    name: "MarkItDown",
    ok: hasMarkItDown || hasMarkit,
    detail: hasMarkItDown ? "markitdown available" : hasMarkit ? "markit available" : "not found; PDF input will fail"
  });

  checks.push({
    name: "OpenAI API",
    ok: Boolean(process.env.OPENAI_API_KEY),
    detail: process.env.OPENAI_API_KEY ? "OPENAI_API_KEY is set" : "OPENAI_API_KEY is not set"
  });

  const bridge = await getBridgeStatus();
  checks.push({
    name: "PTBuilder bridge",
    ok: bridge.ok,
    detail: `${bridge.url}: ${bridge.detail}`
  });

  const packetTracer = await detectPacketTracer();
  checks.push(packetTracer);
  return checks;
}

async function detectPacketTracer(): Promise<DoctorCheck> {
  if (process.platform !== "win32") {
    return {
      name: "Cisco Packet Tracer",
      ok: false,
      detail: "not checked on non-Windows host"
    };
  }

  const candidates = [
    join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Cisco Packet Tracer 8.2.2", "bin", "PacketTracer.exe"),
    join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Cisco Packet Tracer 8.2.1", "bin", "PacketTracer.exe"),
    join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Cisco Packet Tracer 8.2.2", "bin", "PacketTracer.exe")
  ];

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return { name: "Cisco Packet Tracer", ok: true, detail: candidate };
    }
  }
  return {
    name: "Cisco Packet Tracer",
    ok: false,
    detail: "PacketTracer.exe was not found in common install paths"
  };
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false);
}
