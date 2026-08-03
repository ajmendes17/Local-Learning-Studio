import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodexStatusResponse, CodexTask } from "@local-learning-studio/contracts";
import { z } from "zod";
import { CodexModelRouter } from "./model-router.js";

const MAX_DIAGNOSTIC_LENGTH = 64 * 1024;

export type CodexRunErrorCode =
  | "unavailable"
  | "timeout"
  | "execution_failed"
  | "invalid_output";

export class CodexRunError extends Error {
  constructor(
    readonly code: CodexRunErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "CodexRunError";
  }
}

export interface CodexRunResult<T> {
  task: CodexTask;
  model: string;
  startedAt: string;
  durationMs: number;
  output: T;
}

export interface CodexRunnerOptions {
  projectRoot: string;
  command?: string;
  prefixArgs?: string[];
  timeoutMs?: number;
  modelRouter?: CodexModelRouter;
}

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function appendBounded(current: string, chunk: Buffer | string) {
  if (current.length >= MAX_DIAGNOSTIC_LENGTH) return current;
  return (current + chunk.toString()).slice(0, MAX_DIAGNOSTIC_LENGTH);
}

export class CodexRunner {
  private readonly command: string;
  private readonly prefixArgs: string[];
  private readonly timeoutMs: number;
  private readonly modelRouter: CodexModelRouter;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly options: CodexRunnerOptions) {
    this.command = options.command ?? "codex";
    this.prefixArgs = options.prefixArgs ?? [];
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.modelRouter = options.modelRouter ?? new CodexModelRouter();
  }

  async status(): Promise<CodexStatusResponse> {
    try {
      const versionResult = await this.execute(["--version"], undefined, 10_000);
      if (versionResult.exitCode !== 0) {
        return {
          installed: false,
          authenticated: false,
          ready: false,
          version: null,
          detail: versionResult.stderr.trim() || "Codex could not start.",
        };
      }

      const authResult = await this.execute(
        ["login", "status"],
        undefined,
        10_000,
      );
      const authenticated = authResult.exitCode === 0;
      return {
        installed: true,
        authenticated,
        ready: authenticated,
        version: versionResult.stdout.trim() || null,
        detail: authenticated
          ? null
          : authResult.stderr.trim() ||
            authResult.stdout.trim() ||
            "Codex is not authenticated.",
      };
    } catch (error) {
      if (error instanceof CodexRunError && error.code === "unavailable") {
        return {
          installed: false,
          authenticated: false,
          ready: false,
          version: null,
          detail: error.detail ?? error.message,
        };
      }
      throw error;
    }
  }

  run<T>(task: CodexTask, prompt: string, outputSchema: z.ZodType<T>) {
    return this.enqueue(() => this.runNow(task, prompt, outputSchema));
  }

  private async runNow<T>(
    task: CodexTask,
    prompt: string,
    outputSchema: z.ZodType<T>,
  ): Promise<CodexRunResult<T>> {
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    const model = this.modelRouter.modelFor(task);
    const runDirectory = await mkdtemp(join(tmpdir(), "learning-studio-codex-"));
    const schemaPath = join(runDirectory, "output-schema.json");
    const outputPath = join(runDirectory, "output.json");

    try {
      await writeFile(
        schemaPath,
        JSON.stringify(z.toJSONSchema(outputSchema), null, 2),
        "utf8",
      );
      const result = await this.execute(
        [
          "exec",
          "--ephemeral",
          "--model",
          model,
          "--sandbox",
          "read-only",
          "--cd",
          this.options.projectRoot,
          "--output-schema",
          schemaPath,
          "--output-last-message",
          outputPath,
          "-",
        ],
        prompt,
        this.timeoutMs,
      );

      if (result.exitCode !== 0) {
        throw new CodexRunError(
          "execution_failed",
          `Codex failed while running ${task}.`,
          result.stderr.trim() || result.stdout.trim(),
        );
      }

      let rawOutput: string;
      try {
        rawOutput = await readFile(outputPath, "utf8");
      } catch {
        throw new CodexRunError(
          "invalid_output",
          "Codex did not produce a final structured response.",
        );
      }

      try {
        return {
          task,
          model,
          startedAt,
          durationMs: Date.now() - started,
          output: outputSchema.parse(JSON.parse(rawOutput)),
        };
      } catch (error) {
        throw new CodexRunError(
          "invalid_output",
          "Codex returned a response that failed validation.",
          error instanceof Error ? error.message : String(error),
        );
      }
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
    }
  }

  private async enqueue<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  private execute(
    args: string[],
    input?: string,
    timeoutMs = this.timeoutMs,
  ): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, [...this.prefixArgs, ...args], {
        cwd: this.options.projectRoot,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        reject(
          new CodexRunError(
            "timeout",
            `Codex exceeded the ${timeoutMs} ms execution limit.`,
          ),
        );
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout = appendBounded(stdout, chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = appendBounded(stderr, chunk);
      });
      child.on("error", (error: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(
          new CodexRunError(
            "unavailable",
            "The Codex CLI is unavailable.",
            error.message,
          ),
        );
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });

      child.stdin.on("error", () => undefined);
      child.stdin.end(input);
    });
  }
}
