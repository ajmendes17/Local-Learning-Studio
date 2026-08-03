import { CodexStatusResponseSchema } from "@local-learning-studio/contracts";
import type { FastifyInstance } from "fastify";

export interface CodexStatusProvider {
  status(): Promise<unknown>;
}

export async function registerCodexRoutes(
  app: FastifyInstance,
  options: { codex: CodexStatusProvider },
) {
  app.get("/api/codex/status", async () =>
    CodexStatusResponseSchema.parse(await options.codex.status()),
  );
}
