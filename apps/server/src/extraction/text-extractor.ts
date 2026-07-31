import { readFile } from "node:fs/promises";
import type { ExtractedPassage, MaterialExtractor } from "./types.js";

const targetPassageLength = 1_400;

export function splitContent(content: string, maxLength = targetPassageLength) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const segments: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    const candidate = remaining.slice(0, maxLength);
    const breakAt = Math.max(
      candidate.lastIndexOf(". "),
      candidate.lastIndexOf("; "),
      candidate.lastIndexOf(" "),
    );
    const end = breakAt > maxLength * 0.55 ? breakAt + 1 : maxLength;
    segments.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }

  if (remaining) segments.push(remaining);
  return segments;
}

export class TextExtractor implements MaterialExtractor {
  constructor(private readonly markdown: boolean) {}

  async extract(filePath: string): Promise<ExtractedPassage[]> {
    const content = await readFile(filePath, "utf8");
    const lines = content.replace(/\r\n?/g, "\n").split("\n");
    const passages: ExtractedPassage[] = [];
    let heading: string | null = null;
    let paragraph: Array<{ line: string; number: number }> = [];

    const flush = () => {
      if (paragraph.length === 0) return;
      const joined = paragraph.map((item) => item.line).join(" ");
      const lineStart = paragraph[0]!.number;
      const lineEnd = paragraph[paragraph.length - 1]!.number;

      for (const segment of splitContent(joined)) {
        passages.push({
          content: segment,
          location: { kind: "lines", lineStart, lineEnd, heading },
        });
      }
      paragraph = [];
    };

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const markdownHeading = this.markdown
        ? line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)
        : null;

      if (markdownHeading?.[1]) {
        flush();
        heading = markdownHeading[1].trim();
        return;
      }
      if (!line.trim()) {
        flush();
        return;
      }

      const currentLength = paragraph.reduce(
        (total, item) => total + item.line.length + 1,
        0,
      );
      if (currentLength >= targetPassageLength) flush();
      paragraph.push({ line: line.trim(), number: lineNumber });
    });
    flush();

    if (passages.length === 0) {
      throw new Error("No extractable text was found in this file.");
    }
    return passages;
  }
}

