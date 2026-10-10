import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import multipart from "@fastify/multipart";
import {
  API_VERSION,
  type HealthResponse,
} from "@local-learning-studio/contracts";
import Fastify from "fastify";
import { CodexRunner } from "./codex/codex-runner.js";
import { MaterialProcessor } from "./extraction/material-processor.js";
import {
  LearningWorkflowService,
  type LearningCodexClient,
} from "./learning/learning-workflow-service.js";
import {
  registerCodexRoutes,
} from "./routes/codex.js";
import { registerCourseRoutes } from "./routes/courses.js";
import { registerLearningRoutes } from "./routes/learning.js";
import { registerLearnerRoutes } from "./routes/learner.js";
import { registerObsidianRoutes } from "./routes/obsidian.js";
import { CourseLibrary } from "./storage/course-library.js";
import { CourseStructureLibrary } from "./storage/course-structure-library.js";
import { openDatabase } from "./storage/database.js";
import { LearningArtifactLibrary } from "./storage/learning-artifact-library.js";
import { LearnerLibrary } from "./storage/learner-library.js";
import { ObsidianVault } from "./storage/obsidian-vault.js";
import { MaterialStorage } from "./storage/material-storage.js";
import { SourceLibrary } from "./storage/source-library.js";

export interface AppOptions {
  databasePath?: string;
  courseRoot?: string;
  obsidianConfigPath?: string;
  codex?: LearningCodexClient;
}

function findProjectRoot() {
  let current = dirname(fileURLToPath(import.meta.url));
  const filesystemRoot = parse(current).root;

  while (current !== filesystemRoot) {
    if (existsSync(join(current, "tsconfig.base.json"))) return current;
    current = dirname(current);
  }

  throw new Error("Could not locate the Local Learning Studio project root.");
}

export function buildApp(options: AppOptions = {}) {
  const app = Fastify({ logger: false });
  const projectRoot = findProjectRoot();
  const databasePath =
    options.databasePath ?? join(projectRoot, "data", "studio.sqlite");
  const courseRoot = options.courseRoot ?? join(projectRoot, "courses");
  const database = openDatabase(databasePath);
  const library = new CourseLibrary(database);
  const materialStorage = new MaterialStorage(courseRoot);
  const sourceLibrary = new SourceLibrary(database);
  sourceLibrary.recoverInterruptedExtractions();
  const materialProcessor = new MaterialProcessor(sourceLibrary);
  const codex = options.codex ?? new CodexRunner({ projectRoot });
  const operationSubscribers = new Map<string, Set<import("node:stream").Writable>>();
  const latestLearningOperations = new Map<string, Record<string, unknown>>();
  const learningOperations = {
    cached(event: { courseId: string; phase: "classification" | "course-map" }) {
      publish(event.courseId, { type: "cached", ...event });
    },
    started(event: { operationId: string; courseId: string; phase: "classification" | "course-map"; model: string; promptCharacters: number; sourceStats: { materialCount: number; passageCount: number; characterCount: number; materials: Array<{ materialId: string; passageCount: number; characterCount: number }> }; omittedPassageCount: number }) {
      publish(event.courseId, { type: "started", ...event, startedAt: new Date().toISOString() });
    },
    completed(event: { operationId: string; courseId: string; phase: "classification" | "course-map"; result: import("./codex/codex-runner.js").CodexRunResult<unknown> }) {
      publish(event.courseId, { type: "completed", operationId: event.operationId, phase: event.phase, model: event.result.model, durationMs: event.result.durationMs, usage: event.result.usage });
    },
    failed(event: { operationId: string; courseId: string; phase: "classification" | "course-map" }) {
      publish(event.courseId, { type: "failed", operationId: event.operationId, phase: event.phase });
    },
  };
  function publish(courseId: string, event: unknown) {
    if (event && typeof event === "object" && "type" in event) {
      const typed = event as Record<string, unknown>;
      if (typed.type === "started" || typed.type === "completed" || typed.type === "failed" || typed.type === "cached") {
        latestLearningOperations.set(courseId, typed);
      }
    }
    for (const subscriber of operationSubscribers.get(courseId) ?? []) {
      subscriber.write(`id: ${randomUUID()}\ndata: ${JSON.stringify(event)}\n\n`);
    }
  }
  const artifacts = new LearningArtifactLibrary(database);
  const structures = new CourseStructureLibrary(database);
  const learning = new LearningWorkflowService(
    library,
    sourceLibrary,
    artifacts,
    structures,
    codex,
    learningOperations,
  );
  const learner = new LearnerLibrary(database);
  const obsidian = new ObsidianVault(options.obsidianConfigPath ?? join(dirname(databasePath), "obsidian.json"));

  void app.register(multipart, {
    limits: {
      files: 1,
      fileSize: 50 * 1024 * 1024,
    },
  });

  app.get<{ Reply: HealthResponse }>("/api/health", async () => ({
    status: "ok",
    service: "local-learning-studio",
    apiVersion: API_VERSION,
  }));

  void app.register(registerCourseRoutes, {
    library,
    materialStorage,
    materialProcessor,
    sourceLibrary,
  });
  void app.register(registerCodexRoutes, { codex });
  void app.register(registerLearningRoutes, { learning });
  app.get<{ Params: { courseId: string } }>("/api/courses/:courseId/learning-operations", async (request, reply) => {
    const courseId = request.params.courseId;
    if (!library.getCourseDetail(courseId)) return reply.code(404).send({ error: "Course not found." });
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" });
    reply.raw.write(": connected\n\n");
    const latestOperation = latestLearningOperations.get(courseId);
    if (latestOperation) reply.raw.write(`data: ${JSON.stringify(latestOperation)}\n\n`);
    const subscriber = reply.raw;
    const subscribers = operationSubscribers.get(courseId) ?? new Set();
    subscribers.add(subscriber);
    operationSubscribers.set(courseId, subscribers);
    const heartbeat = setInterval(() => subscriber.write(": keep-alive\n\n"), 15_000);
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      subscribers.delete(subscriber);
      if (subscribers.size === 0) operationSubscribers.delete(courseId);
    });
  });
  void app.register(registerLearnerRoutes, { learner, artifacts, codex, courses: library, sources: sourceLibrary });
  void app.register(registerObsidianRoutes, { vault: obsidian, courses: library, artifacts, learner, sources: sourceLibrary });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
      return reply.code(413).send({
        error: "This file is too large.",
        detail: "Course materials must be 50 MB or smaller.",
      });
    }

    app.log.error(error);
    return reply.code(500).send({
      error: "The local service could not complete this request.",
    });
  });

  app.addHook("onClose", async () => {
    database.close();
  });

  return app;
}
