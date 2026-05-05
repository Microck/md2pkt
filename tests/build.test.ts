import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { buildPkt } from "../src/build";
import { startFakeBridge } from "../src/bridge";

let closeBridge: (() => Promise<void>) | undefined;

afterEach(async () => {
  await closeBridge?.();
  closeBridge = undefined;
  delete process.env.MD2PKT_BRIDGE_URL;
});

describe("buildPkt", () => {
  it("queues a build through a fake bridge and writes artifacts", async () => {
    const bridge = await startFakeBridge(0);
    closeBridge = bridge.close;
    process.env.MD2PKT_BRIDGE_URL = bridge.url;

    const dir = await mkdtemp(join(tmpdir(), "md2pkt-build-"));
    const input = join(dir, "assignment.md");
    const output = join(dir, "assignment.pkt");
    await writeFile(input, "Build 2 routers, 2 switches, 4 PCs, DHCP and static routing.", "utf8");

    const artifacts = await buildPkt(input, { out: output, engine: "auto" });

    expect(artifacts.spec.devices).toHaveLength(8);
    expect(bridge.received).toHaveLength(1);
    expect(bridge.received[0]?.out).toBe(output);
  }, 20_000);

  it("falls back to the Packet Tracer MCP /queue bridge when /enqueue is missing", async () => {
    const bridge = await startQueueOnlyBridge();
    closeBridge = bridge.close;
    process.env.MD2PKT_BRIDGE_URL = bridge.url;

    const dir = await mkdtemp(join(tmpdir(), "md2pkt-build-"));
    const input = join(dir, "assignment.md");
    const output = join(dir, "assignment.pkt");
    await writeFile(input, "Build 1 router, 1 switch, and 2 PCs.", "utf8");

    await buildPkt(input, { out: output, engine: "auto" });

    expect(bridge.received).toHaveLength(1);
    expect(bridge.received[0]).toContain("md2pktTrySave");
  }, 20_000);
});

function startQueueOnlyBridge(): Promise<{ url: string; close: () => Promise<void>; received: string[] }> {
  const received: string[] = [];
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ connected: true, last_poll_ago: 0 }));
      return;
    }

    if (request.method === "POST" && request.url === "/enqueue") {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("");
      return;
    }

    if (request.method === "POST" && request.url === "/queue") {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", chunk => {
        body += chunk;
      });
      request.on("end", () => {
        received.push(body);
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("queued");
      });
      return;
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("");
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        received,
        close: () => closeServer(server)
      });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}
