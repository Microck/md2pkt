import type { InterfaceAddress, LanPlan, TopologySpec } from "./topology-schema";

export function generateIosConfig(spec: TopologySpec): string {
  const routers = spec.devices.filter(device => device.type === "router");
  const sections: string[] = [];

  for (const router of routers) {
    const interfaces = spec.interfaceAddresses.filter(address => address.device === router.id);
    const lines = [
      `! ${router.id}`,
      "enable",
      "configure terminal",
      `hostname ${router.id}`,
      ...interfaces.flatMap(renderInterface)
    ];

    if (spec.services.dhcp) {
      lines.push(...renderDhcp(router.id, spec.lans));
    }
    lines.push(...renderRouting(router.id, spec));
    lines.push("end", "write memory");
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}

function renderInterface(address: InterfaceAddress): string[] {
  return [
    `interface ${address.port}`,
    address.description ? ` description ${address.description}` : undefined,
    ` ip address ${address.ip} ${address.mask}`,
    " no shutdown",
    " exit"
  ].filter((line): line is string => Boolean(line));
}

function renderDhcp(routerId: string, lans: LanPlan[]): string[] {
  const lan = lans.find(item => item.router === routerId);
  if (!lan) return [];
  const [networkBase] = lan.subnet.split("/");
  const octets = networkBase?.split(".") ?? [];
  const poolId = lan.id.toUpperCase();
  return [
    `ip dhcp excluded-address ${lan.gateway}`,
    `ip dhcp pool ${poolId}`,
    ` network ${networkBase} 255.255.255.0`,
    ` default-router ${lan.gateway}`,
    " dns-server 8.8.8.8",
    " exit",
    `! DHCP pool ${poolId} serves ${octets.slice(0, 3).join(".")}.0/24`
  ];
}

function renderRouting(routerId: string, spec: TopologySpec): string[] {
  if (spec.routing === "none") return [];
  const connectedNetworks = new Set(
    spec.interfaceAddresses
      .filter(address => address.device === routerId)
      .map(address => networkStatement(address.ip, address.mask))
  );

  if (spec.routing === "ospf") {
    return [
      "router ospf 1",
      ...Array.from(connectedNetworks).map(network => ` network ${network.network} ${network.wildcard} area 0`),
      " exit"
    ];
  }

  if (spec.routing === "eigrp") {
    return [
      "router eigrp 100",
      ...Array.from(connectedNetworks).map(network => ` network ${network.network} ${network.wildcard}`),
      " no auto-summary",
      " exit"
    ];
  }

  if (spec.routing === "rip") {
    return [
      "router rip",
      " version 2",
      ...Array.from(new Set(Array.from(connectedNetworks).map(network => network.network.split(".").slice(0, 2).join(".") + ".0.0"))).map(network => ` network ${network}`),
      " no auto-summary",
      " exit"
    ];
  }

  return renderStaticRoutes(routerId, spec);
}

function renderStaticRoutes(routerId: string, spec: TopologySpec): string[] {
  const ownLan = spec.lans.find(lan => lan.router === routerId);
  const routerNumber = Number.parseInt(routerId.replace(/\D+/g, ""), 10);
  if (!ownLan || Number.isNaN(routerNumber)) return [];

  return spec.lans
    .filter(lan => lan.router !== routerId)
    .map(lan => {
      const targetNumber = Number.parseInt(lan.router.replace(/\D+/g, ""), 10);
      const nextHopIndex = targetNumber > routerNumber ? routerNumber - 1 : routerNumber - 2;
      const nextHop = targetNumber > routerNumber
        ? `10.0.${nextHopIndex}.2`
        : `10.0.${nextHopIndex}.1`;
      const network = lan.subnet.split("/")[0] ?? lan.subnet;
      return `ip route ${network} 255.255.255.0 ${nextHop}`;
    });
}

function networkStatement(ip: string, mask: string): { network: string; wildcard: string } {
  const ipParts = ip.split(".").map(part => Number.parseInt(part, 10));
  const maskParts = mask.split(".").map(part => Number.parseInt(part, 10));
  const network = ipParts.map((part, index) => part & (maskParts[index] ?? 0)).join(".");
  const wildcard = maskParts.map(part => 255 - part).join(".");
  return { network, wildcard };
}
