import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import type { Readable } from "node:stream";
import type { MaterialKind } from "@local-learning-studio/contracts";
import type { CourseLibrary } from "../storage/course-library.js";
import type { MaterialStorage } from "../storage/material-storage.js";
import type { MaterialProcessor } from "./material-processor.js";

export const MATERIAL_EXTENSIONS = new Set([".docx", ".md", ".pdf", ".pptx", ".txt"]);
export class MaterialIngestion {
  constructor(private readonly library: CourseLibrary, private readonly storage: MaterialStorage, private readonly processor: MaterialProcessor) {}
  supports(filename: string) { return MATERIAL_EXTENSIONS.has(extname(filename).toLowerCase()); }
  async ingest(courseId: string, filename: string, mediaType: string, kind: MaterialKind, source: Readable) {
    if (!this.supports(filename)) throw new Error("This material format is not supported.");
    const id = randomUUID();
    const stored = await this.storage.store(courseId, id, filename, source);
    let material;
    try {
      material = this.library.createMaterial({ id, courseId, originalName: filename, storedName: stored.storedName, mediaType, kind, sizeBytes: stored.sizeBytes, initialStatus: "processing" });
    } catch (error) {
      await this.storage.remove(courseId, stored.storedName);
      throw error;
    }
    return this.processor.process(material, this.storage.pathFor(courseId, stored.storedName));
  }
}
