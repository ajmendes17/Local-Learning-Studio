import {
  API_VERSION,
  type HealthResponse,
} from "@local-learning-studio/contracts";
import Fastify from "fastify";

export function buildApp() {
  const app = Fastify({ logger: false });

  app.get<{ Reply: HealthResponse }>("/api/health", async () => ({
    status: "ok",
    service: "local-learning-studio",
    apiVersion: API_VERSION,
  }));

  return app;
}

