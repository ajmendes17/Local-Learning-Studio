import { extname } from "node:path";
import type { CourseMaterial } from "@local-learning-studio/contracts";
import type { SourceLibrary } from "../storage/source-library.js";
import { PdfExtractor } from "./pdf-extractor.js";
import { TextExtractor } from "./text-extractor.js";
import type { MaterialExtractor } from "./types.js";

const extractors = new Map<string, MaterialExtractor>([
  [".md", new TextExtractor(true)],
  [".txt", new TextExtractor(false)],
  [".pdf", new PdfExtractor()],
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
}

