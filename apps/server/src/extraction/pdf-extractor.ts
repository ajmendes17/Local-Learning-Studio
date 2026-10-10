import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { reconstructStackedSquareRootFractions } from "./pdf-math-layout.js";
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
        const positionedItems = textContent.items.flatMap((item) => "str" in item ? [{
          str: item.str,
          transform: item.transform,
          width: item.width,
          height: item.height,
          hasEOL: item.hasEOL,
        }] : []);
        const pageText = reconstructStackedSquareRootFractions(positionedItems);

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
