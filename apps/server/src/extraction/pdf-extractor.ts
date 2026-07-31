import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { splitContent } from "./text-extractor.js";
import type { ExtractedPassage, MaterialExtractor } from "./types.js";

export class PdfExtractor implements MaterialExtractor {
  async extract(filePath: string): Promise<ExtractedPassage[]> {
    const bytes = new Uint8Array(await readFile(filePath));
    const loadingTask = getDocument({
      data: bytes,
      useSystemFonts: true,
    });
    const document = await loadingTask.promise;
    const passages: ExtractedPassage[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const textContent = await page.getTextContent();
        let pageText = "";

        for (const item of textContent.items) {
          if (!("str" in item)) continue;
          pageText += item.str;
          pageText += item.hasEOL ? "\n" : " ";
        }

        for (const segment of splitContent(pageText)) {
          passages.push({
            content: segment,
            location: {
              kind: "page",
              pageStart: pageNumber,
              pageEnd: pageNumber,
            },
          });
        }
      }
    } finally {
      await loadingTask.destroy();
    }

    if (passages.length === 0) {
      throw new Error(
        "No selectable PDF text was found. Scanned PDFs require OCR.",
      );
    }
    return passages;
  }
}
