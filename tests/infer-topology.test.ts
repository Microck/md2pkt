import { describe, expect, it } from "vitest";
import { inferTopology } from "../src/infer-topology";
import { topologySpecSchema } from "../src/topology-schema";

describe("inferTopology", () => {
  it("normalizes a common CCNA assignment", () => {
    const spec = inferTopology("# Lab\nBuild a network with 2 routers, 2 switches, 4 PCs, DHCP and static routing.", "lab.md", "markdown");

    expect(topologySpecSchema.safeParse(spec).success).toBe(true);
    expect(spec.devices.map(device => device.id)).toEqual(["R1", "R2", "SW1", "SW2", "PC1", "PC2", "PC3", "PC4"]);
    expect(spec.routing).toBe("static");
    expect(spec.services.dhcp).toBe(true);
    expect(spec.lans).toHaveLength(2);
    expect(spec.links.some(link => link.id === "R1-R2" && link.cable === "cross")).toBe(true);
  });

  it("uses deterministic defaults when counts are missing", () => {
    const spec = inferTopology("Create a small DHCP LAN.", "small.md", "markdown");

    expect(spec.devices.filter(device => device.type === "router")).toHaveLength(1);
    expect(spec.devices.filter(device => device.type === "switch")).toHaveLength(1);
    expect(spec.devices.filter(device => device.type === "pc")).toHaveLength(2);
    expect(spec.assumptions.length).toBeGreaterThan(0);
  });
});
