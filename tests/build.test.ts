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
});
