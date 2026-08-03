import { readFile } from "node:fs/promises";
import { DOMParser, type Element, type Node } from "@xmldom/xmldom";
import { strFromU8, unzipSync, type UnzipFileInfo } from "fflate";
import { splitContent } from "./text-extractor.js";
import type { ExtractedPassage, MaterialExtractor } from "./types.js";

const wordNamespace =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const drawingNamespace =
  "http://schemas.openxmlformats.org/drawingml/2006/main";
const maximumExtractedXmlBytes = 25 * 1024 * 1024;
const targetPassageLength = 1_400;

type OfficeKind = "docx" | "pptx";

function isRequiredEntry(kind: OfficeKind, name: string) {
  if (kind === "docx") return name === "word/document.xml";
  return /^ppt\/slides\/slide\d+\.xml$/.test(name);
}

function readOfficeXml(packageBytes: Uint8Array, kind: OfficeKind) {
  let selectedBytes = 0;
  const files = unzipSync(packageBytes, {
    filter(file: UnzipFileInfo) {
      if (!isRequiredEntry(kind, file.name)) return false;
      selectedBytes += file.originalSize;
      if (selectedBytes > maximumExtractedXmlBytes) {
        throw new Error(
          "The Office document contains too much extracted XML to process safely.",
        );
      }
      return true;
    },
  });
  return files;
}

function parseXml(bytes: Uint8Array, sourceName: string) {
  try {
    return new DOMParser({
      onError(level, message) {
        if (level !== "warning") throw new Error(message);
      },
    }).parseFromString(strFromU8(bytes), "application/xml");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown XML error";
    throw new Error(`Could not parse ${sourceName}: ${detail}`);
  }
}

function attribute(element: Element, localName: string) {
  return (
    element.getAttributeNS(wordNamespace, localName) ??
    element.getAttribute(`w:${localName}`) ??
    element.getAttribute(localName)
  );
}

function wordParagraphText(node: Node): string {
  if (node.nodeType === 1) {
    const element = node as Element;
    if (element.namespaceURI === wordNamespace) {
      if (element.localName === "t") return element.textContent ?? "";
      if (element.localName === "tab") return "\t";
      if (element.localName === "br" || element.localName === "cr") {
        return "\n";
      }
    }
  }

  let text = "";
  for (let child = node.firstChild; child; child = child.nextSibling) {
    text += wordParagraphText(child);
  }
  return text;
}

function wordHeading(paragraph: Element, text: string) {
  const style = paragraph.getElementsByTagNameNS(wordNamespace, "pStyle")[0];
  const styleName = style ? attribute(style, "val") : null;
  if (!styleName || !/^(?:heading\s*[1-9]|title)$/i.test(styleName)) {
    return null;
  }
  return text;
}

function extractDocx(files: Record<string, Uint8Array>) {
  const documentXml = files["word/document.xml"];
  if (!documentXml) {
    throw new Error("The DOCX package does not contain word/document.xml.");
  }

  const document = parseXml(documentXml, "word/document.xml");
  const paragraphs = Array.from(
    document.getElementsByTagNameNS(wordNamespace, "p"),
  );
  const passages: ExtractedPassage[] = [];
  let heading: string | null = null;
  let buffer: Array<{ number: number; text: string }> = [];
  let bufferLength = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const paragraphStart = buffer[0]!.number;
    const paragraphEnd = buffer[buffer.length - 1]!.number;
    for (const content of splitContent(
      buffer.map(({ text }) => text).join(" "),
    )) {
      passages.push({
        content,
        location: {
          kind: "paragraphs",
          paragraphStart,
          paragraphEnd,
          heading,
        },
      });
    }
    buffer = [];
    bufferLength = 0;
  };

  paragraphs.forEach((paragraph, index) => {
    const text = wordParagraphText(paragraph).replace(/\s+/g, " ").trim();
    if (!text) {
      flush();
      return;
    }

    const nextHeading = wordHeading(paragraph, text);
    if (nextHeading) {
      flush();
      heading = nextHeading;
      return;
    }

    if (bufferLength + text.length + 1 > targetPassageLength) flush();
    buffer.push({ number: index + 1, text });
    bufferLength += text.length + 1;
  });
  flush();

  if (passages.length === 0) {
    throw new Error("No extractable text was found in this DOCX file.");
  }
  return passages;
}

function slideNumber(name: string) {
  const match = name.match(/slide(\d+)\.xml$/);
  return match?.[1] ? Number(match[1]) : 0;
}

function extractPptx(files: Record<string, Uint8Array>) {
  const slideEntries = Object.entries(files).sort(
    ([left], [right]) => slideNumber(left) - slideNumber(right),
  );
  if (slideEntries.length === 0) {
    throw new Error("The PPTX package does not contain any slides.");
  }

  const passages: ExtractedPassage[] = [];
  for (const [name, bytes] of slideEntries) {
    const number = slideNumber(name);
    const document = parseXml(bytes, name);
    const lines = Array.from(
      document.getElementsByTagNameNS(drawingNamespace, "t"),
    )
      .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const title = lines[0] ?? null;
    for (const content of splitContent(lines.join(" "))) {
      passages.push({
        content,
        location: {
          kind: "slides",
          slideStart: number,
          slideEnd: number,
          title,
        },
      });
    }
  }

  if (passages.length === 0) {
    throw new Error(
      "No extractable slide text was found. Image-only slides require OCR.",
    );
  }
  return passages;
}

export class OoxmlExtractor implements MaterialExtractor {
  constructor(private readonly kind: OfficeKind) {}

  async extract(filePath: string): Promise<ExtractedPassage[]> {
    try {
      const bytes = new Uint8Array(await readFile(filePath));
      const files = readOfficeXml(bytes, this.kind);
      return this.kind === "docx" ? extractDocx(files) : extractPptx(files);
    } catch (error) {
      if (error instanceof Error && /DOCX|PPTX|Office|slide/i.test(error.message)) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : "unknown package error";
      throw new Error(
        `The ${this.kind.toUpperCase()} package could not be read: ${detail}`,
      );
    }
  }
}
