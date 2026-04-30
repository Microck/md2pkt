import type { TopologySpec } from "./topology-schema";

export function renderReport(spec: TopologySpec, outPath: string): string {
  const lines = [
    `md2pkt report for ${outPath}`,
    "",
    `Title: ${spec.title}`,
    `Engine: ${spec.engine}`,
    `Devices: ${spec.devices.length}`,
    `Links: ${spec.links.length}`,
    `Routing: ${spec.routing}`,
    `DHCP: ${spec.services.dhcp ? "enabled" : "disabled"}`,
    "",
    "Devices:",
    ...spec.devices.map(device => `- ${device.id}: ${device.model} (${device.type})`),
    "",
    "Links:",
    ...spec.links.map(link => `- ${link.from} ${link.fromPort} <-> ${link.to} ${link.toPort} (${link.cable})`),
    "",
    "Assumptions:",
    ...(spec.assumptions.length > 0 ? spec.assumptions.map(item => `- ${item}`) : ["- None"]),
    "",
    "Warnings:",
    ...(spec.warnings.length > 0 ? spec.warnings.map(item => `- ${item}`) : ["- None"])
  ];

  return `${lines.join("\n")}\n`;
}
