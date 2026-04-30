import { z } from "zod";

export const buildEngineSchema = z.enum(["auto", "codex", "api"]);
export type BuildEngine = z.infer<typeof buildEngineSchema>;

export const routingProtocolSchema = z.enum(["none", "static", "ospf", "eigrp", "rip"]);
export type RoutingProtocol = z.infer<typeof routingProtocolSchema>;

export const deviceTypeSchema = z.enum(["router", "switch", "pc", "server"]);
export type DeviceType = z.infer<typeof deviceTypeSchema>;

export const cableTypeSchema = z.enum(["straight", "cross", "serial", "fiber", "console", "auto"]);
export type CableType = z.infer<typeof cableTypeSchema>;

export const interfaceAddressSchema = z.object({
  device: z.string().min(1),
  port: z.string().min(1),
  ip: z.string().min(1),
  mask: z.string().min(1),
  description: z.string().optional()
});
export type InterfaceAddress = z.infer<typeof interfaceAddressSchema>;

export const hostAddressSchema = z.object({
  device: z.string().min(1),
  ip: z.string().min(1),
  mask: z.string().min(1),
  gateway: z.string().min(1),
  dns: z.string().min(1).default("8.8.8.8")
});
export type HostAddress = z.infer<typeof hostAddressSchema>;

export const deviceSchema = z.object({
  id: z.string().min(1),
  type: deviceTypeSchema,
  model: z.string().min(1),
  x: z.number().int(),
  y: z.number().int(),
  lan: z.string().optional()
});
export type DevicePlan = z.infer<typeof deviceSchema>;

export const linkSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  fromPort: z.string().min(1),
  to: z.string().min(1),
  toPort: z.string().min(1),
  cable: cableTypeSchema
});
export type LinkPlan = z.infer<typeof linkSchema>;

export const lanSchema = z.object({
  id: z.string().min(1),
  router: z.string().min(1),
  switch: z.string().min(1),
  hosts: z.array(z.string().min(1)),
  subnet: z.string().min(1),
  gateway: z.string().min(1)
});
export type LanPlan = z.infer<typeof lanSchema>;

export const topologySpecSchema = z.object({
  version: z.literal("md2pkt.v1"),
  title: z.string().min(1),
  source: z.object({
    path: z.string().min(1),
    kind: z.enum(["markdown", "pdf"])
  }),
  engine: z.string().min(1),
  routing: routingProtocolSchema,
  services: z.object({
    dhcp: z.boolean(),
    nat: z.boolean(),
    acl: z.boolean(),
    vlans: z.number().int().nonnegative()
  }),
  devices: z.array(deviceSchema).min(1),
  links: z.array(linkSchema),
  lans: z.array(lanSchema),
  interfaceAddresses: z.array(interfaceAddressSchema),
  hostAddresses: z.array(hostAddressSchema),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string())
});
export type TopologySpec = z.infer<typeof topologySpecSchema>;

export interface BuildArtifacts {
  spec: TopologySpec;
  ptbuilderScript: string;
  iosConfig: string;
  report: string;
}
