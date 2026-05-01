import { extname } from "node:path";
import { readFile } from "node:fs/promises";
import { TextDecoder } from "node:util";
import { commandExists, runCommand } from "./run-command";

export type SourceKind = "markdown" | "pdf";

export interface ExtractedInstructions {
  path: string;
  kind: SourceKind;
  markdown: string;
}

export async function extractInstructions(path: string): Promise<ExtractedInstructions> {
  const extension = extname(path).toLowerCase();

  if (extension === ".md" || extension === ".markdown" || extension === ".txt") {
    return {
      path,
      kind: "markdown",
      markdown: await readMarkdownInput(path)
    };
  }

  if (extension === ".pdf") {
    return {
      path,
      kind: "pdf",
      markdown: await extractPdfWithMarkItDown(path)
    };
  }

  throw new Error(`Unsupported input type "${extension}". Use .md, .markdown, .txt, or text-based .pdf.`);
}

async function readMarkdownInput(path: string): Promise<string> {
  const bytes = await readFile(path);
  let markdown: string;

  try {
    markdown = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${path} does not look like Markdown or UTF-8 text.`);
  }

  const trimmed = markdown.trim();
  if (!trimmed) {
    throw new Error(`${path} does not contain any instructions.`);
  }

  if (trimmed.startsWith("%PDF-") || markdown.includes("\0")) {
    throw new Error(`${path} does not look like Markdown or UTF-8 text.`);
  }

  return markdown;
}

async function extractPdfWithMarkItDown(path: string): Promise<string> {
  if (await commandExists("markitdown")) {
    const result = await runCommand("markitdown", [path]);
    if (result.code === 0 && result.stdout.trim()) {
      return result.stdout;
    }
    throw new Error(`markitdown failed for ${path}: ${result.stderr || result.stdout}`);
  }

  if (await commandExists("markit")) {
    const result = await runCommand("markit", [path, "-q"]);
    if (result.code === 0 && result.stdout.trim()) {
      return result.stdout;
    }
    throw new Error(`markit failed for ${path}: ${result.stderr || result.stdout}`);
  }

  throw new Error("PDF input requires MarkItDown. Install a MarkItDown-compatible CLI such as markitdown, or provide Markdown.");
}
