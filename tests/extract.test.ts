import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { extractInstructions } from "../src/extract";

describe("extractInstructions", () => {
  it("reads markdown input", async () => {
    const dir = await mkdtemp(join(tmpdir(), "md2pkt-extract-"));
    const file = join(dir, "assignment.md");
    await writeFile(file, "# Assignment\n2 routers", "utf8");

    await expect(extractInstructions(file)).resolves.toMatchObject({
      kind: "markdown",
      markdown: "# Assignment\n2 routers"
    });
  });

  it("rejects unsupported inputs", async () => {
    await expect(extractInstructions("assignment.docx")).rejects.toThrow("Unsupported input type");
  });
});
