import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  CourseDetailSchema,
  CourseListResponseSchema,
  CreateCourseRequestSchema,
  MaterialPassagesResponseSchema,
  MaterialKindSchema,
} from "@local-learning-studio/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { MaterialProcessor } from "../extraction/material-processor.js";
import type { CourseLibrary } from "../storage/course-library.js";
import type { MaterialStorage } from "../storage/material-storage.js";
import type { SourceLibrary } from "../storage/source-library.js";

const courseIdSchema = z.string().uuid();
const passageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});
const supportedExtensions = new Set([".docx", ".md", ".pdf", ".pptx", ".txt"]);

interface CourseRouteOptions {
  library: CourseLibrary;
  materialProcessor: MaterialProcessor;
  materialStorage: MaterialStorage;
  sourceLibrary: SourceLibrary;
}

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "The request is invalid.";
}

export async function registerCourseRoutes(
  app: FastifyInstance,
  options: CourseRouteOptions,
) {
  const { library, materialProcessor, materialStorage, sourceLibrary } = options;

  app.get("/api/courses", async () =>
    CourseListResponseSchema.parse({ courses: library.listCourses() }),
  );

  app.post("/api/courses", async (request, reply) => {
    const parsed = CreateCourseRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Course details are invalid.",
        detail: firstIssue(parsed.error),
      });
    }

    const course = library.createCourse(parsed.data);
    return reply.code(201).send(course);
  });

  app.get<{ Params: { courseId: string } }>(
    "/api/courses/:courseId",
    async (request, reply) => {
      const parsedId = courseIdSchema.safeParse(request.params.courseId);
      if (!parsedId.success) {
        return reply.code(400).send({ error: "Course ID is invalid." });
      }

      const course = library.getCourseDetail(parsedId.data);
      if (!course) {
        return reply.code(404).send({ error: "Course not found." });
      }

      return CourseDetailSchema.parse(course);
    },
  );

  app.get<{
    Params: { courseId: string; materialId: string };
    Querystring: { limit?: string; offset?: string };
  }>(
    "/api/courses/:courseId/materials/:materialId/passages",
    async (request, reply) => {
      const parsedCourseId = courseIdSchema.safeParse(request.params.courseId);
      const parsedMaterialId = courseIdSchema.safeParse(
        request.params.materialId,
      );
      const parsedQuery = passageQuerySchema.safeParse(request.query);
      if (!parsedCourseId.success || !parsedMaterialId.success) {
        return reply.code(400).send({ error: "Source ID is invalid." });
      }
      if (!parsedQuery.success) {
        return reply.code(400).send({
          error: "Passage range is invalid.",
          detail: "Use a nonnegative offset and a limit from 1 to 200.",
        });
      }
      if (
        !sourceLibrary.getMaterial(
          parsedCourseId.data,
          parsedMaterialId.data,
        )
      ) {
        return reply.code(404).send({ error: "Course material not found." });
      }

      return MaterialPassagesResponseSchema.parse({
        passages: sourceLibrary.getPassages(
          parsedCourseId.data,
          parsedMaterialId.data,
          parsedQuery.data.limit,
          parsedQuery.data.offset,
        ),
        total: sourceLibrary.countPassages(
          parsedCourseId.data,
          parsedMaterialId.data,
        ),
        ...parsedQuery.data,
      });
    },
  );

  app.post<{
    Params: { courseId: string };
    Querystring: { kind?: string };
  }>("/api/courses/:courseId/materials", async (request, reply) => {
    const parsedId = courseIdSchema.safeParse(request.params.courseId);
    const parsedKind = MaterialKindSchema.safeParse(request.query.kind);

    if (!parsedId.success) {
      return reply.code(400).send({ error: "Course ID is invalid." });
    }
    if (!parsedKind.success) {
      return reply.code(400).send({
        error: "Material type is invalid.",
        detail: "Choose a supported material category.",
      });
    }
    if (!library.getCourse(parsedId.data)) {
      return reply.code(404).send({ error: "Course not found." });
    }

    const part = await request.file();
    if (!part?.filename) {
      return reply.code(400).send({ error: "Choose one file to upload." });
    }

    const extension = extname(part.filename).toLowerCase();
    if (!supportedExtensions.has(extension)) {
      part.file.resume();
      return reply.code(415).send({
        error: "This file type is not supported.",
        detail: "Upload a PDF, Markdown, text, DOCX, or PPTX file.",
      });
    }

    const materialId = randomUUID();
    const stored = await materialStorage.store(
      parsedId.data,
      materialId,
      part.filename,
      part.file,
    );

    let material;
    try {
      material = library.createMaterial({
        id: materialId,
        courseId: parsedId.data,
        originalName: part.filename,
        storedName: stored.storedName,
        mediaType: part.mimetype || "application/octet-stream",
        kind: parsedKind.data,
        sizeBytes: stored.sizeBytes,
        initialStatus: materialProcessor.canExtract(part.filename)
          ? "processing"
          : "stored",
      });
    } catch (error) {
      await materialStorage.remove(parsedId.data, stored.storedName);
      throw error;
    }

    const processed = await materialProcessor.process(
      material,
      materialStorage.pathFor(parsedId.data, stored.storedName),
    );
    return reply.code(201).send(processed);
  });
}
