import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { commandExists, runCommand } from "./run-command";
import { inferTopology } from "./infer-topology";
import { topologySpecSchema, type BuildEngine, type TopologySpec } from "./topology-schema";

export interface PlanInput {
  markdown: string;
  sourcePath: string;
  sourceKind: "markdown" | "pdf";
  engine: BuildEngine;
}

export async function planTopology(input: PlanInput): Promise<TopologySpec> {
  const baseline = inferTopology(input.markdown, input.sourcePath, input.sourceKind);

  if (input.engine === "codex") {
    return planWithCodex(input, baseline);
  }

  if (input.engine === "api") {
    return planWithOpenAiApi(input, baseline);
  }

  const codexAvailable = await commandExists("codex");
  if (codexAvailable) {
    const codexPlan = await planWithCodex(input, baseline).catch(error => {
      baseline.warnings.push(`Codex engine failed and auto mode continued: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    });
    if (codexPlan) return codexPlan;
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    const apiPlan = await planWithOpenAiApi(input, baseline).catch(error => {
      baseline.warnings.push(`OpenAI API engine failed and deterministic inference was used: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    });
    if (apiPlan) return apiPlan;
  }

  return {
    ...baseline,
    engine: "deterministic"
  };
}

async function planWithCodex(input: PlanInput, baseline: TopologySpec): Promise<TopologySpec> {
  if (!(await commandExists("codex"))) {
    throw new Error("codex CLI is not installed or not on PATH.");
  }

  const dir = await mkdtemp(join(tmpdir(), "md2pkt-codex-"));
  const outputPath = join(dir, "plan.json");
  try {
    const prompt = buildPlanningPrompt(input.markdown, baseline);
    const result = await runCommand("codex", [
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--ask-for-approval",
      "never",
      "--sandbox",
      "read-only",
      "--output-last-message",
      outputPath,
      prompt
    ], undefined, 180_000);

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `codex exited with ${result.code}`);
    }

    return parsePlannedSpec(await readFile(outputPath, "utf8"), "codex", input);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function planWithOpenAiApi(input: PlanInput, baseline: TopologySpec): Promise<TopologySpec> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.MD2PKT_OPENAI_MODEL ?? "gpt-5.1-mini",
      input: buildPlanningPrompt(input.markdown, baseline)
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API request failed with ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const text = payload.output_text ?? payload.output?.flatMap(item => item.content ?? []).map(item => item.text ?? "").join("\n");
  if (!text?.trim()) {
    throw new Error("OpenAI API returned no text.");
  }
  return parsePlannedSpec(text, "api", input);
}

function buildPlanningPrompt(markdown: string, baseline: TopologySpec): string {
  return [
    "You are md2pkt's one-turn topology planner.",
    "Return only valid JSON matching the provided baseline object shape. Do not ask follow-up questions.",
    "Use deterministic assumptions when details are missing. Keep device ids stable unless the instructions require a change.",
    "Do not include Markdown fences or prose.",
    "",
    "BASELINE JSON:",
    JSON.stringify(baseline, null, 2),
    "",
    "SOURCE INSTRUCTIONS:",
    markdown
  ].join("\n");
}

function parsePlannedSpec(text: string, engine: string, input: PlanInput): TopologySpec {
  const jsonText = extractJsonObject(text);
  const parsed = topologySpecSchema.parse(JSON.parse(jsonText));
  return {
    ...parsed,
    engine,
    source: {
      path: input.sourcePath,
      kind: input.sourceKind
    }
  };
}

export function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        candidates.push(trimmed.slice(start, index + 1));
        start = -1;
      }
    }
  }

  const jsonText = candidates.at(-1);
  if (!jsonText) {
    throw new Error("Planner response did not contain a JSON object.");
  }
  return jsonText;
}

export async function writeBaselineSchema(path: string): Promise<void> {
  await writeFile(path, JSON.stringify(topologySpecSchema.shape, null, 2), "utf8");
}
