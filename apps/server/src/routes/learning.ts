import {
  AssessmentReconciliationResponseSchema,
  CourseLearningArtifactsResponseSchema,
  CourseMapArtifactSchema,
  GenerateLearningArtifactRequestSchema,
  SourceClassificationArtifactSchema,
} from "@local-learning-studio/contracts";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { CodexRunError } from "../codex/codex-runner.js";
import {
  LearningWorkflowError,
  type LearningWorkflowService,
} from "../learning/learning-workflow-service.js";
import type { ObsidianVault } from "../storage/obsidian-vault.js";

const routeParamsSchema = z.object({
  courseId: z.string().uuid(),
});
const artifactRouteParamsSchema = routeParamsSchema.extend({
  artifactId: z.string().uuid(),
});

function sendWorkflowError(error: unknown, reply: FastifyReply) {
  if (error instanceof LearningWorkflowError) {
    const status = {
      course_not_found: 404,
      no_sources: 409,
      classification_required: 409,
      artifact_not_found: 404,
      invalid_source_references: 422,
      assessment_required: 409,
    }[error.code];
    return reply.code(status).send({ error: error.message, ...(error.diagnostics ? { diagnostics: error.diagnostics } : {}) });
  }
  if (error instanceof CodexRunError) {
    return reply.code(error.code === "unavailable" ? 503 : 502).send({
      error: error.message,
      detail:
        error.code === "timeout"
          ? "Try again after the current Codex workload clears."
          : error.code === "invalid_output"
            ? "The generated response did not match the expected structure. Inspect the validation details and retry."
            : "Check the configured model and local Codex authentication.",
      ...(error.code === "invalid_output" && error.detail
        ? { diagnostics: { responseValidation: error.detail.slice(0, 4_000) } }
        : {}),
    });
  }
  throw error;
}

export async function registerLearningRoutes(
  app: FastifyInstance,
  options: { learning: LearningWorkflowService; vault: ObsidianVault },
) {
  app.get<{ Params: { courseId: string } }>(
    "/api/courses/:courseId/learning-artifacts",
    async (request, reply) => {
      const params = routeParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Course ID is invalid." });
      }
      try {
        return CourseLearningArtifactsResponseSchema.parse(
          options.learning.getArtifacts(params.data.courseId),
        );
      } catch (error) {
        return sendWorkflowError(error, reply);
      }
    },
  );

  app.get<{ Params: { courseId: string } }>(
    "/api/courses/:courseId/course-map/accepted",
    async (request, reply) => {
      const params = routeParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Course ID is invalid." });
      try {
        return CourseMapArtifactSchema.nullable().parse(options.learning.getAcceptedCourseMap(params.data.courseId));
      } catch (error) {
        return sendWorkflowError(error, reply);
      }
    },
  );

  app.post<{
    Params: { courseId: string };
  }>(
    "/api/courses/:courseId/source-classification",
    async (request, reply) => {
      const params = routeParamsSchema.safeParse(request.params);
      const body = GenerateLearningArtifactRequestSchema.safeParse(
        request.body ?? {},
      );
      if (!params.success || !body.success) {
        return reply.code(400).send({ error: "Analysis request is invalid." });
      }
      try {
        return SourceClassificationArtifactSchema.parse(
          await options.learning.classifySources(
            params.data.courseId,
            body.data.regenerate,
          ),
        );
      } catch (error) {
        return sendWorkflowError(error, reply);
      }
    },
  );

  app.post<{
    Params: { courseId: string };
  }>("/api/courses/:courseId/course-map", async (request, reply) => {
    const params = routeParamsSchema.safeParse(request.params);
    const body = GenerateLearningArtifactRequestSchema.safeParse(
      request.body ?? {},
    );
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "Course-map request is invalid." });
    }
    try {
      return CourseMapArtifactSchema.parse(
        await options.learning.buildCourseMap(
          params.data.courseId,
          body.data.regenerate,
        ),
      );
    } catch (error) {
      return sendWorkflowError(error, reply);
    }
  });

  app.post<{
    Params: { courseId: string; artifactId: string };
  }>(
    "/api/courses/:courseId/course-map/:artifactId/accept",
    async (request, reply) => {
      const params = artifactRouteParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Artifact ID is invalid." });
      }
      try {
        return CourseMapArtifactSchema.parse(
          options.learning.acceptCourseMap(
            params.data.courseId,
            params.data.artifactId,
          ),
        );
      } catch (error) {
        return sendWorkflowError(error, reply);
      }
    },
  );

  app.post<{ Params: { courseId: string } }>("/api/courses/:courseId/assessment-reconciliation", async (request, reply) => {
    const params = routeParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Course ID is invalid." });
    try {
      const course = options.learning.getCourseForReconciliation(params.data.courseId);
      const notes = await options.vault.readAssessmentNotes(course.id, course.title);
      return AssessmentReconciliationResponseSchema.parse(await options.learning.reconcileAssessments(params.data.courseId, notes));
    } catch (error) {
      return sendWorkflowError(error, reply);
    }
  });

  app.post<{ Params: { courseId: string }; Body: unknown }>("/api/courses/:courseId/assessment-reconciliation/merge", async (request, reply) => {
    const params = routeParamsSchema.safeParse(request.params);
    const body = z.object({ canonicalRecordKey: z.string().regex(/^O\d+$/), duplicateRecordKeys: z.array(z.string().regex(/^O\d+$/)).min(1).max(20) }).safeParse(request.body);
    if (!params.success || !body.success || body.data.duplicateRecordKeys.includes(body.data.canonicalRecordKey) || new Set([body.data.canonicalRecordKey, ...body.data.duplicateRecordKeys]).size !== body.data.duplicateRecordKeys.length + 1) {
      return reply.code(400).send({ error: "Choose one canonical assessment note and one or more distinct duplicate notes." });
    }
    try {
      const course = options.learning.getCourseForReconciliation(params.data.courseId);
      const notes = await options.vault.readAssessmentNotes(course.id, course.title);
      const byKey = new Map(notes.map((note, index) => [`O${index + 1}`, note]));
      const canonical = byKey.get(body.data.canonicalRecordKey);
      const duplicates = body.data.duplicateRecordKeys.map((key) => byKey.get(key));
      if (!canonical || duplicates.some((note) => !note)) return reply.code(409).send({ error: "The assessment notes changed after this suggestion. Compare the current notes again." });
      return await options.vault.mergeAssessmentNotes(course.id, course.title, canonical.filename, duplicates.map((note) => note!.filename));
    } catch (error) {
      return reply.code(422).send({ error: error instanceof Error ? error.message : "Could not combine the generated assessment notes." });
    }
  });
}
