import { describe, expect, it } from "vitest";
import { extractJsonObject, planTopology } from "../src/engines";

describe("planner engine helpers", () => {
  it("extracts the last complete JSON object without swallowing earlier objects", () => {
    const response = [
      "First draft:",
      "{\"ignored\":true}",
      "Final plan:",
      "{\"version\":\"md2pkt.v1\",\"engine\":\"api\"}"
    ].join("\n");

    expect(extractJsonObject(response)).toBe("{\"version\":\"md2pkt.v1\",\"engine\":\"api\"}");
  });

  it("treats whitespace-only OPENAI_API_KEY as unset", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "   ";

    try {
      await expect(planTopology({
        markdown: "Build 1 router, 1 switch, and 2 PCs.",
        sourcePath: "assignment.md",
        sourceKind: "markdown",
        engine: "api"
      })).rejects.toThrow("OPENAI_API_KEY is not set");
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });
});
