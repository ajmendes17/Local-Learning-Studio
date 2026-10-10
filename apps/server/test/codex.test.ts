import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CodexStatusResponseSchema } from "@local-learning-studio/contracts";
import { z } from "zod";
import { buildApp } from "../src/app.js";
import { CodexRunError, CodexRunner } from "../src/codex/codex-runner.js";
import {
  CodexModelRouter,
  configuredCodexModels,
} from "../src/codex/model-router.js";

const fakeCodexSource = `
import { writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("codex-cli 9.9.9-test");
  process.exit(0);
}
if (args[0] === "login" && args[1] === "status") {
  console.log("Logged in using test credentials");
  process.exit(0);
}
if (args[0] !== "exec") process.exit(2);

let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
const valueAfter = (flag) => args[args.indexOf(flag) + 1];
const delay = Number(prompt.match(/delay:(\\d+)/)?.[1] ?? 0);
if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
if (prompt.includes("fail")) {
  console.error("simulated Codex failure; OPENAI_API_KEY=sk-test-key-1234567890");
  process.exit(7);
}
const output = prompt.includes("invalid")
  ? { unexpected: true }
  : { summary: prompt.trim(), model: valueAfter("--model") };
await writeFile(valueAfter("--output-last-message"), JSON.stringify(output));
console.log(JSON.stringify(output));
`;

async function fakeRunner(timeoutMs = 1_000) {
  const root = await mkdtemp(join(tmpdir(), "learning-studio-codex-test-"));
  const executable = join(root, "fake-codex.mjs");
  await writeFile(executable, fakeCodexSource, "utf8");
  return {
    root,
    runner: new CodexRunner({
      projectRoot: root,
      command: process.execPath,
      prefixArgs: [executable],
      timeoutMs,
    }),
  };
}

const outputSchema = z.object({
  summary: z.string(),
  model: z.string(),
});

test("model router keeps narrow tasks on Luna and synthesis on Terra", () => {
  const models = configuredCodexModels({
    CODEX_MODEL_LUNA: "luna-test",
    CODEX_MODEL_TERRA: "terra-test",
    CODEX_MODEL_SOL: "sol-test",
  });
  const router = new CodexModelRouter(models);

  assert.equal(router.modelFor("explain-course-concept"), "luna-test");
  assert.equal(router.modelFor("generate-course-quiz"), "terra-test");
  assert.equal(router.modelFor("audit-learning-artifact"), "sol-test");
});

test("Codex runner reports local installation and authentication", async () => {
  const { root, runner } = await fakeRunner();
  assert.deepEqual(await runner.status(), {
    installed: true,
    authenticated: true,
    ready: true,
    version: "codex-cli 9.9.9-test",
    detail: null,
  });
  await rm(root, { recursive: true });
});

test("Codex runner selects a model and validates structured output", async () => {
  const { root, runner } = await fakeRunner();
  const result = await runner.run(
    "explain-course-concept",
    "Explain confidence intervals",
    outputSchema,
  );

  assert.equal(result.model, "gpt-5.6-luna");
  assert.deepEqual(result.output, {
    summary: "Explain confidence intervals",
    model: "gpt-5.6-luna",
  });
  await rm(root, { recursive: true });
});

test("Codex runner rejects execution failures and invalid output", async () => {
  const { root, runner } = await fakeRunner();

  await assert.rejects(
    runner.run("map-course", "fail", outputSchema),
    (error: unknown) => error instanceof CodexRunError
      && error.code === "execution_failed"
      && error.detail === "simulated Codex failure; OPENAI_API_KEY=[redacted]",
  );
  await assert.rejects(
    runner.run("map-course", "invalid", outputSchema),
    (error: unknown) =>
      error instanceof CodexRunError && error.code === "invalid_output",
  );
  await rm(root, { recursive: true });
});

test("Codex runner stops a timed-out run explicitly", async () => {
  const { root, runner } = await fakeRunner(25);

  await assert.rejects(
    runner.run("map-course", "delay:250", outputSchema),
    (error: unknown) =>
      error instanceof CodexRunError && error.code === "timeout",
  );
  await rm(root, { recursive: true });
});

test("Codex runner serializes model calls", async () => {
  const { root, runner } = await fakeRunner();
  const started = Date.now();
  await Promise.all([
    runner.run("map-course", "delay:80 first", outputSchema),
    runner.run("map-course", "delay:80 second", outputSchema),
  ]);

  assert.ok(Date.now() - started >= 140);
  await rm(root, { recursive: true });
});

test("GET /api/codex/status exposes setup readiness", async () => {
  const root = await mkdtemp(join(tmpdir(), "learning-studio-status-test-"));
  const app = buildApp({
    databasePath: join(root, "data", "studio.sqlite"),
    courseRoot: join(root, "courses"),
    codex: {
      status: async () => ({
        installed: true,
        authenticated: false,
        ready: false,
        version: "codex-cli 1.2.3",
        detail: "Run codex login.",
      }),
      run: async () => {
        throw new Error("Unexpected model run in status test.");
      },
    },
  });

  const response = await app.inject({ method: "GET", url: "/api/codex/status" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(CodexStatusResponseSchema.parse(response.json()), {
    installed: true,
    authenticated: false,
    ready: false,
    version: "codex-cli 1.2.3",
    detail: "Run codex login.",
  });

  await app.close();
  await rm(root, { recursive: true });
});
