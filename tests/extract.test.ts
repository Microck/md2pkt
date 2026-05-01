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

  it("rejects empty text input", async () => {
    const dir = await mkdtemp(join(tmpdir(), "md2pkt-extract-"));
    const file = join(dir, "empty.txt");
    await writeFile(file, " \n\t", "utf8");

    await expect(extractInstructions(file)).rejects.toThrow("does not contain any instructions");
  });

  it("rejects obvious binary content renamed as markdown", async () => {
    const dir = await mkdtemp(join(tmpdir(), "md2pkt-extract-"));
    const file = join(dir, "assignment.md");
    await writeFile(file, Buffer.from("%PDF-1.7\n%\xff\x00\x00", "binary"));

    await expect(extractInstructions(file)).rejects.toThrow("does not look like Markdown");
  });

  it("rejects unsupported inputs", async () => {
    await expect(extractInstructions("assignment.docx")).rejects.toThrow("Unsupported input type");
  });
});
