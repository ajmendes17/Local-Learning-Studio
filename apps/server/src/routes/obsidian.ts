import { isAbsolute } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { CourseLibrary } from "../storage/course-library.js";
import type { LearningArtifactLibrary } from "../storage/learning-artifact-library.js";
import type { LearnerLibrary } from "../storage/learner-library.js";
import type { SourceLibrary } from "../storage/source-library.js";
import { ObsidianVault } from "../storage/obsidian-vault.js";

const configSchema = z.object({ vaultPath: z.string().trim().min(1).max(1000), folderPath: z.string().trim().min(1).max(300).optional() });
const courseParams = z.object({ courseId: z.string().uuid() });

export async function registerObsidianRoutes(app: FastifyInstance, options: {
  vault: ObsidianVault;
  courses: CourseLibrary;
  artifacts: LearningArtifactLibrary;
  learner: LearnerLibrary;
  sources: SourceLibrary;
}) {
  app.get("/api/obsidian/status", async () => {
    const config = await options.vault.getConfig();
    return config
      ? { configured: true, vaultPath: config.vaultPath, folderPath: config.folderPath, mode: "local-files" }
      : { configured: false, vaultPath: null, folderPath: "Codex/Local Learning Studio", mode: "local-files" };
  });

  app.post("/api/obsidian/config", async (request, reply) => {
    const parsed = configSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Vault settings are invalid." });
    if (!isAbsolute(parsed.data.vaultPath)) return reply.code(400).send({ error: "Enter the absolute path to an existing Obsidian vault folder." });
    try {
      const config = await options.vault.configure(parsed.data.vaultPath, parsed.data.folderPath);
      return { configured: true, ...config, mode: "local-files" };
    } catch (error) {
      return reply.code(422).send({ error: error instanceof Error ? error.message : "Could not save vault settings." });
    }
  });

  app.post<{ Params: { courseId: string } }>("/api/courses/:courseId/obsidian/export", async (request, reply) => {
    const parsed = courseParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Class ID is invalid." });
    const course = options.courses.getCourseDetail(parsed.data.courseId);
    if (!course) return reply.code(404).send({ error: "Class not found." });
    const acceptedMap = options.artifacts.acceptedCourseMap(course.id);
    try {
      const result = await options.vault.exportCourse({
        course: {
          id: course.id, title: course.title, code: course.code, term: course.term,
          materials: course.materials.map((material) => {
            const passages = [];
            if (material.status === "ready") {
              let offset = 0;
              while (true) {
                const batch = options.sources.getPassages(course.id, material.id, 200, offset);
                passages.push(...batch);
                if (batch.length < 200) break;
                offset += batch.length;
              }
            }
            return { ...material, passages, annotations: options.sources.getAnnotations(course.id, material.id) };
          }),
        },
        map: acceptedMap?.payload ?? null,
        profile: options.learner.getProfile(course.id),
        methodProgress: options.learner.getMethodProgress(course.id),
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not export class notes.";
      const status = message.includes("Configure an Obsidian vault") ? 409 : 422;
      return reply.code(status).send({ error: message });
    }
  });
}
