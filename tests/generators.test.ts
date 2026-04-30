import { describe, expect, it } from "vitest";
import { inferTopology } from "../src/infer-topology";
import { generateIosConfig } from "../src/generate-ios";
import { generatePtBuilderScript } from "../src/generate-ptbuilder";

describe("generators", () => {
  it("generates PTBuilder JavaScript and IOS config", () => {
    const spec = inferTopology("Build 2 routers, 2 switches, 4 PCs, DHCP and OSPF.", "lab.md", "markdown");
    const ios = generateIosConfig(spec);
    const script = generatePtBuilderScript(spec, "C:\\Labs\\lab.pkt", ios);

    expect(ios).toContain("router ospf 1");
    expect(ios).toContain("ip dhcp pool LAN1");
    expect(script).toContain('md2pktCall("addDevice"');
    expect(script).toContain('md2pktCall("addLink"');
    expect(script).toContain("md2pktTrySave");
  });
});
