import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const defaultBridgeUrl = "http://127.0.0.1:54321";

export interface BridgeStatus {
  ok: boolean;
  url: string;
  detail: string;
}

export async function getBridgeStatus(url = process.env.MD2PKT_BRIDGE_URL ?? defaultBridgeUrl): Promise<BridgeStatus> {
  try {
    const response = await fetch(`${url}/status`);
    if (!response.ok) {
      return { ok: false, url, detail: `HTTP ${response.status}` };
    }
    return { ok: true, url, detail: await response.text() };
  } catch (error) {
    return { ok: false, url, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function enqueueBuild(script: string, outPath: string, url = process.env.MD2PKT_BRIDGE_URL ?? defaultBridgeUrl): Promise<void> {
  const response = await fetch(`${url}/enqueue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ script, out: outPath })
  });

  if (!response.ok) {
    throw new Error(`Bridge rejected build with HTTP ${response.status}: ${await response.text()}`);
  }
}

export async function installBridgeBootstrap(targetDir = defaultBootstrapDir()): Promise<string> {
  await mkdir(targetDir, { recursive: true });
  const bootstrapPath = join(targetDir, "ptbuilder-bootstrap.js");
  await writeFile(bootstrapPath, bridgeBootstrapScript(), "utf8");
  return bootstrapPath;
}

export async function repairBridge(targetDir = defaultBootstrapDir()): Promise<string> {
  return installBridgeBootstrap(targetDir);
}

export function bridgeBootstrapScript(): string {
  return "/* md2pkt bridge */ window.webview.evaluateJavaScriptAsync(\"setInterval(function(){var x=new XMLHttpRequest();x.open('GET','http://127.0.0.1:54321/next',true);x.onload=function(){if(x.status===200&&x.responseText){$se('runCode',x.responseText)}};x.onerror=function(){};x.send()},500)\");\n";
}

export function startFakeBridge(port = 54321): Promise<{ url: string; close: () => Promise<void>; received: Array<{ script: string; out: string }> }> {
  const received: Array<{ script: string; out: string }> = [];
  const queue: string[] = [];
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/status") {
      send(response, 200, "md2pkt fake bridge ready");
      return;
    }
    if (request.method === "GET" && request.url === "/next") {
      send(response, 200, queue.shift() ?? "");
      return;
    }
    if (request.method === "POST" && request.url === "/enqueue") {
      const body = JSON.parse(await readBody(request)) as { script: string; out: string };
      received.push(body);
      queue.push(body.script);
      await mkdir(dirname(body.out), { recursive: true });
      await writeFile(body.out, "PKT output is created by Packet Tracer in production. Fake bridge acceptance artifact.\n", "utf8");
      send(response, 200, "queued");
      return;
    }
    send(response, 404, "not found");
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        received,
        close: () => new Promise<void>((closeResolve, closeReject) => {
          server.close(error => error ? closeReject(error) : closeResolve());
        })
      });
    });
  });
}

function defaultBootstrapDir(): string {
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA ?? process.cwd(), "md2pkt");
  }
  return join(process.cwd(), ".md2pkt");
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function send(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(body);
}
