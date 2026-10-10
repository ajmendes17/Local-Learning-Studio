import {
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
    }[error.code];
    return reply.code(status).send({ error: error.message, ...(error.diagnostics ? { diagnostics: error.diagnostics } : {}) });
  }
  if (error instanceof CodexRunError) {
    return reply.code(error.code === "unavailable" ? 503 : 502).send({
      error: error.message,
      detail:
        error.code === "timeout"
          ? "Try again after the current Codex workload clears."
          : "Check the configured model and local Codex authentication.",
    });
  }
  throw error;
}

export async function registerLearningRoutes(
  app: FastifyInstance,
  options: { learning: LearningWorkflowService },
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
}
