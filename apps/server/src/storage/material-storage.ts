import { createWriteStream } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface StoredMaterialFile {
  storedName: string;
  sizeBytes: number;
}

function safeFilename(filename: string) {
  const normalized = filename
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);

  return normalized || "material";
}

export class MaterialStorage {
  constructor(private readonly courseRoot: string) {}

  async store(
    courseId: string,
    materialId: string,
    originalName: string,
    source: Readable,
  ): Promise<StoredMaterialFile> {
    const directory = join(this.courseRoot, courseId, "materials");
    const storedName = `${materialId}--${safeFilename(originalName)}`;
    const temporaryPath = join(directory, `.${materialId}.upload`);
    const finalPath = join(directory, storedName);
    let sizeBytes = 0;

    await mkdir(directory, { recursive: true });

    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.length;
        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        source,
        counter,
        createWriteStream(temporaryPath, { flags: "wx" }),
      );
      await rename(temporaryPath, finalPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }

    return { storedName, sizeBytes };
  }

  async remove(courseId: string, storedName: string) {
    await unlink(join(this.courseRoot, courseId, "materials", storedName)).catch(
      () => undefined,
    );
  }

  pathFor(courseId: string, storedName: string) {
    return join(this.courseRoot, courseId, "materials", storedName);
  }
}

