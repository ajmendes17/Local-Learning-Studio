import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { CanvasImportJobSchema, CanvasImportRequestSchema, CanvasImportStartedSchema, CanvasPreviewRequestSchema, CanvasPreviewSchema, CanvasStatusSchema } from "@local-learning-studio/contracts";
import { CanvasError } from "../canvas/canvas-client.js";
import type { CanvasImportService } from "../canvas/canvas-import-service.js";

export async function registerCanvasRoutes(app: FastifyInstance, service: CanvasImportService) {
  app.addHook("onRequest", async (request, reply) => {
    if (request.method !== "POST") return;
    let sameOrigin = true;
    try {
      if (request.headers.origin) {
        const origin = new URL(request.headers.origin);
        // Vite forwards /api to port 4318 and rewrites Host during local development.
        const localWeb = origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) && origin.port === "4317";
        sameOrigin = origin.host === request.headers.host || localWeb;
      }
    }
    catch { sameOrigin = false; }
    if (!sameOrigin || request.headers["sec-fetch-site"] === "cross-site") return reply.code(403).send({ error: "Canvas imports must be started from this local application." });
  });
  function failure(error: unknown, reply: FastifyReply) {
    if (error instanceof CanvasError) return reply.code(error.status).send({ error: error.message });
    return reply.code(502).send({ error: "Canvas returned data that could not be processed. Preview the course again to retry." });
  }
  app.get("/api/canvas/status", async () => CanvasStatusSchema.parse(service.status()));
  app.post("/api/canvas/preview", async (request, reply) => {
    const input = CanvasPreviewRequestSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: "Paste a valid Canvas course URL." });
    try { return CanvasPreviewSchema.parse(await service.preview(input.data.courseUrl)); }
    catch (error) { return failure(error, reply); }
  });
  app.post("/api/canvas/imports", async (request, reply) => {
    const input = CanvasImportRequestSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: "Choose course details and at least one resource from the preview." });
    try { return reply.code(202).send(CanvasImportStartedSchema.parse(service.start(input.data))); }
    catch (error) { return failure(error, reply); }
  });
  app.get<{ Params: { jobId: string } }>("/api/canvas/imports/:jobId", async (request, reply) => {
    if (!z.string().uuid().safeParse(request.params.jobId).success) return reply.code(400).send({ error: "Import ID is invalid." });
    const job = service.job(request.params.jobId);
    return job ? CanvasImportJobSchema.parse(job) : reply.code(404).send({ error: "Canvas import not found." });
  });
}
