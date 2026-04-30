import type { CableType, DevicePlan, HostAddress, InterfaceAddress, LanPlan, LinkPlan, RoutingProtocol, TopologySpec } from "./topology-schema";

interface CountHints {
  routers: number;
  switches: number;
  pcs: number;
  servers: number;
}

const numberWords = new Map<string, number>([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10]
]);

export function inferTopology(markdown: string, sourcePath: string, sourceKind: "markdown" | "pdf", engine = "deterministic"): TopologySpec {
  const text = normalizeText(markdown);
  const hints = extractCountHints(text);
  const routing = detectRouting(text, hints.routers);
  const dhcp = /\bdhcp\b/i.test(text);
  const nat = /\bnat\b/i.test(text);
  const acl = /\bacls?\b|\baccess[- ]lists?\b/i.test(text);
  const vlans = extractCount(text, ["vlan", "vlans"]) ?? (/router on a stick|router-on-a-stick/i.test(text) ? 2 : 0);

  const devices: DevicePlan[] = [];
  const links: LinkPlan[] = [];
  const lans: LanPlan[] = [];
  const interfaceAddresses: InterfaceAddress[] = [];
  const hostAddresses: HostAddress[] = [];
  const assumptions: string[] = [];
  const warnings: string[] = [];

  if (!/\brouters?\b|\brtrs?\b/.test(text)) {
    assumptions.push("No router count was specified; one router was created as the LAN gateway.");
  }
  if (!/\bswitch(?:es)?\b|\bsw\b/.test(text)) {
    assumptions.push("No switch count was specified; one access switch was created per router LAN.");
  }
  if (!/\bpcs?\b|\bcomputers?\b|\bhosts?\b|\bworkstations?\b|\bservers?\b/.test(text)) {
    assumptions.push("No host count was specified; two PCs were created so the topology is testable.");
  }
  if (vlans > 0) {
    warnings.push("VLAN intent was detected. v1 records the requirement but generates a flat LAN unless the LLM engine returns a richer plan.");
  }
  if (nat) {
    warnings.push("NAT intent was detected. v1 records the requirement and leaves NAT-specific IOS for a later hardening pass.");
  }
  if (acl) {
    warnings.push("ACL intent was detected. v1 records the requirement and leaves ACL-specific IOS for a later hardening pass.");
  }

  for (let index = 1; index <= hints.routers; index += 1) {
    devices.push({
      id: `R${index}`,
      type: "router",
      model: "2911",
      x: 120 + (index - 1) * 240,
      y: 120
    });
  }

  const switchCount = Math.max(hints.switches, hints.routers);
  for (let index = 1; index <= switchCount; index += 1) {
    const lanId = `LAN${Math.min(index, hints.routers)}`;
    devices.push({
      id: `SW${index}`,
      type: "switch",
      model: "2960-24TT",
      x: 120 + (index - 1) * 240,
      y: 280,
      lan: lanId
    });
  }

  const hostIds: string[] = [];
  for (let index = 1; index <= hints.pcs; index += 1) {
    hostIds.push(`PC${index}`);
    devices.push({
      id: `PC${index}`,
      type: "pc",
      model: "PC-PT",
      x: 60 + (index - 1) * 80,
      y: 440,
      lan: `LAN${bucketIndex(index, hints.pcs, hints.routers)}`
    });
  }
  for (let index = 1; index <= hints.servers; index += 1) {
    hostIds.push(`SRV${index}`);
    devices.push({
      id: `SRV${index}`,
      type: "server",
      model: "Server-PT",
      x: 100 + (hints.pcs + index - 1) * 80,
      y: 520,
      lan: `LAN${bucketIndex(hints.pcs + index, hostIds.length, hints.routers)}`
    });
  }

  for (let index = 1; index <= hints.routers; index += 1) {
    const lanId = `LAN${index}`;
    const router = `R${index}`;
    const sw = `SW${Math.min(index, switchCount)}`;
    const subnet = `192.168.${index - 1}.0/24`;
    const gateway = `192.168.${index - 1}.1`;
    const lanHosts = devices.filter(device => device.lan === lanId && (device.type === "pc" || device.type === "server")).map(device => device.id);

    lans.push({ id: lanId, router, switch: sw, hosts: lanHosts, subnet, gateway });
    interfaceAddresses.push({
      device: router,
      port: "GigabitEthernet0/0",
      ip: gateway,
      mask: "255.255.255.0",
      description: `${lanId} gateway`
    });
    links.push({
      id: `${router}-${sw}`,
      from: router,
      fromPort: "GigabitEthernet0/0",
      to: sw,
      toPort: "GigabitEthernet0/1",
      cable: "straight"
    });

    lanHosts.forEach((host, hostIndex) => {
      const accessPort = `FastEthernet0/${hostIndex + 1}`;
      links.push({
        id: `${sw}-${host}`,
        from: sw,
        fromPort: accessPort,
        to: host,
        toPort: "FastEthernet0",
        cable: "straight"
      });
      hostAddresses.push({
        device: host,
        ip: `192.168.${index - 1}.${hostIndex + 2}`,
        mask: "255.255.255.0",
        gateway,
        dns: "8.8.8.8"
      });
    });
  }

  for (let index = 1; index < hints.routers; index += 1) {
    const left = `R${index}`;
    const right = `R${index + 1}`;
    const network = `10.0.${index - 1}`;
    const leftPort = index === 1 ? "GigabitEthernet0/1" : "GigabitEthernet0/2";
    const rightPort = "GigabitEthernet0/1";
    links.push({
      id: `${left}-${right}`,
      from: left,
      fromPort: leftPort,
      to: right,
      toPort: rightPort,
      cable: inferCable("router", "router")
    });
    interfaceAddresses.push({
      device: left,
      port: leftPort,
      ip: `${network}.1`,
      mask: "255.255.255.252",
      description: `WAN to ${right}`
    });
    interfaceAddresses.push({
      device: right,
      port: rightPort,
      ip: `${network}.2`,
      mask: "255.255.255.252",
      description: `WAN to ${left}`
    });
  }

  return {
    version: "md2pkt.v1",
    title: inferTitle(markdown),
    source: { path: sourcePath, kind: sourceKind },
    engine,
    routing,
    services: { dhcp, nat, acl, vlans },
    devices,
    links,
    lans,
    interfaceAddresses,
    hostAddresses,
    assumptions,
    warnings
  };
}

function normalizeText(markdown: string): string {
  return markdown.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractCountHints(text: string): CountHints {
  const routers = extractCount(text, ["router", "routers", "rtr", "rtrs"]) ?? 1;
  const switches = extractCount(text, ["switch", "switches", "sw"]) ?? routers;
  const pcs = extractCount(text, ["pc", "pcs", "computer", "computers", "host", "hosts", "workstation", "workstations"]) ?? 2;
  const servers = extractCount(text, ["server", "servers"]) ?? 0;
  return {
    routers: clamp(routers, 1, 8),
    switches: clamp(switches, 0, 12),
    pcs: clamp(pcs, 0, 48),
    servers: clamp(servers, 0, 12)
  };
}

function extractCount(text: string, nouns: string[]): number | undefined {
  for (const noun of nouns) {
    const numeric = new RegExp(`\\b(\\d+)\\s+${escapeRegExp(noun)}\\b`, "i").exec(text);
    if (numeric?.[1]) {
      return Number.parseInt(numeric[1], 10);
    }

    for (const [word, count] of numberWords) {
      const wordPattern = new RegExp(`\\b${word}\\s+${escapeRegExp(noun)}\\b`, "i");
      if (wordPattern.test(text)) {
        return count;
      }
    }
  }
  return undefined;
}

function detectRouting(text: string, routers: number): RoutingProtocol {
  if (/\bospf\b/i.test(text)) return "ospf";
  if (/\beigrp\b/i.test(text)) return "eigrp";
  if (/\brip\b/i.test(text)) return "rip";
  if (/\bstatic\b/i.test(text)) return "static";
  return routers > 1 ? "static" : "none";
}

function inferCable(a: "router" | "switch" | "pc" | "server", b: "router" | "switch" | "pc" | "server"): CableType {
  if (a === b && (a === "router" || a === "switch")) {
    return "cross";
  }
  return "straight";
}

function bucketIndex(itemIndex: number, itemCount: number, bucketCount: number): number {
  if (itemCount === 0) return 1;
  return Math.min(bucketCount, Math.floor(((itemIndex - 1) * bucketCount) / itemCount) + 1);
}

function inferTitle(markdown: string): string {
  const heading = /^#\s+(.+)$/m.exec(markdown);
  return heading?.[1]?.trim() || "Generated Packet Tracer Topology";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
