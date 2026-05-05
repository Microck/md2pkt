import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { bridgeBootstrapScript, installBridgeBootstrap } from "../src/bridge";

describe("bridge installation", () => {
  it("copies PTBuilder and writes the polling bootstrap", async () => {
    const dir = await mkdtemp(join(tmpdir(), "md2pkt-bridge-"));

    const install = await installBridgeBootstrap(dir);

    await expect(readFile(install.builderPtsPath)).resolves.toHaveLength(82_248);
    await expect(readFile(install.bootstrapPath, "utf8")).resolves.toBe(bridgeBootstrapScript());
  });
});
