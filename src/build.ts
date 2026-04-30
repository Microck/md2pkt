import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { extractInstructions } from "./extract";
import { planTopology } from "./engines";
import { enqueueBuild, getBridgeStatus } from "./bridge";
import { generateIosConfig } from "./generate-ios";
import { generatePtBuilderScript } from "./generate-ptbuilder";
import { renderReport } from "./report";
import { buildEngineSchema, topologySpecSchema, type BuildArtifacts, type BuildEngine } from "./topology-schema";

export interface BuildOptions {
  out: string;
  engine: BuildEngine;
}

export async function buildPkt(inputPath: string, options: BuildOptions): Promise<BuildArtifacts> {
  const engine = buildEngineSchema.parse(options.engine);
  const extracted = await extractInstructions(inputPath);
  const spec = topologySpecSchema.parse(await planTopology({
    markdown: extracted.markdown,
    sourcePath: inputPath,
    sourceKind: extracted.kind,
    engine
  }));

  const iosConfig = generateIosConfig(spec);
  const ptbuilderScript = generatePtBuilderScript(spec, options.out, iosConfig);
  const report = renderReport(spec, options.out);

  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(`${options.out}.ptbuilder.js`, ptbuilderScript, "utf8");
  await writeFile(`${options.out}.ios.txt`, iosConfig, "utf8");
  await writeFile(`${options.out}.md2pkt-report.json`, JSON.stringify({ spec, report }, null, 2), "utf8");

  const bridge = await getBridgeStatus();
  if (!bridge.ok) {
    throw new Error(`PTBuilder bridge is unavailable at ${bridge.url}: ${bridge.detail}. Run "md2pkt bridge install" and start the bridge before building .pkt files.`);
  }
  await enqueueBuild(ptbuilderScript, options.out, bridge.url);

  return { spec, ptbuilderScript, iosConfig, report };
}
