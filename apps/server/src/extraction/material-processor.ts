import { extname } from "node:path";
import type { CourseMaterial } from "@local-learning-studio/contracts";
import type { SourceLibrary } from "../storage/source-library.js";
import { OoxmlExtractor } from "./ooxml-extractor.js";
import { PdfExtractor } from "./pdf-extractor.js";
import { TextExtractor } from "./text-extractor.js";
import type { MaterialExtractor } from "./types.js";

const extractors = new Map<string, MaterialExtractor>([
  [".docx", new OoxmlExtractor("docx")],
  [".md", new TextExtractor(true)],
  [".txt", new TextExtractor(false)],
  [".pdf", new PdfExtractor()],
  [".pptx", new OoxmlExtractor("pptx")],
]);

export class MaterialProcessor {
  constructor(private readonly sources: SourceLibrary) {}

  canExtract(filename: string) {
    return extractors.has(extname(filename).toLowerCase());
  }

  async process(
    material: CourseMaterial,
    filePath: string,
  ): Promise<CourseMaterial> {
    const extractor = extractors.get(
      extname(material.originalName).toLowerCase(),
    );
    if (!extractor) return material;

    try {
      const passages = await extractor.extract(filePath);
      this.sources.completeExtraction(material.courseId, material.id, passages);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Source extraction failed for an unknown reason.";
      this.sources.failExtraction(material.courseId, material.id, message);
    }

    return this.sources.getMaterial(material.courseId, material.id)!;
  }

  async reprocess(material: CourseMaterial, filePath: string) {
    const extractor = extractors.get(extname(material.originalName).toLowerCase());
    if (!extractor) throw new Error("This source type cannot be reprocessed.");
    const passages = await extractor.extract(filePath);
    if (!passages.length) throw new Error("No readable text was found; the existing extraction was kept.");
    this.sources.completeExtraction(material.courseId, material.id, passages);
    return this.sources.getMaterial(material.courseId, material.id)!;
  }
}
