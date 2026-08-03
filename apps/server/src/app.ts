import { existsSync } from "node:fs";
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
  registerCodexRoutes,
  type CodexStatusProvider,
} from "./routes/codex.js";
import { registerCourseRoutes } from "./routes/courses.js";
import { CourseLibrary } from "./storage/course-library.js";
import { openDatabase } from "./storage/database.js";
import { MaterialStorage } from "./storage/material-storage.js";
import { SourceLibrary } from "./storage/source-library.js";

export interface AppOptions {
  databasePath?: string;
  courseRoot?: string;
  codex?: CodexStatusProvider;
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
