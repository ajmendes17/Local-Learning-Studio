import assert from "node:assert/strict";
import test from "node:test";
import { API_VERSION } from "@local-learning-studio/contracts";
import { buildApp } from "../src/app.js";

test("GET /api/health reports the shared API version", async () => {
  const app = buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/api/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "local-learning-studio",
    apiVersion: API_VERSION,
  });

  await app.close();
});

