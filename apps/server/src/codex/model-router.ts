import type { CodexTask } from "@local-learning-studio/contracts";

export interface CodexModels {
  luna: string;
  terra: string;
  sol: string;
}

const taskTiers: Record<CodexTask, keyof CodexModels> = {
  "classify-course-sources": "luna",
  "map-course": "terra",
  "build-training-plan": "terra",
  "compose-study-lesson": "terra",
  "explain-course-concept": "luna",
  "generate-adaptive-practice": "terra",
  "evaluate-learner-response": "luna",
  "generate-course-quiz": "terra",
  "plan-remediation": "terra",
  "audit-learning-artifact": "sol",
};

export function configuredCodexModels(
  environment: NodeJS.ProcessEnv = process.env,
): CodexModels {
  return {
    luna: environment.CODEX_MODEL_LUNA || "gpt-5.6-luna",
    terra: environment.CODEX_MODEL_TERRA || "gpt-5.6-terra",
    sol: environment.CODEX_MODEL_SOL || "gpt-5.6-sol",
  };
}

export class CodexModelRouter {
  constructor(private readonly models = configuredCodexModels()) {}

  modelFor(task: CodexTask) {
    return this.models[taskTiers[task]];
  }
}
