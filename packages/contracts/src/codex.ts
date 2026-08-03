import { z } from "zod";

export const CodexTaskSchema = z.enum([
  "classify-course-sources",
  "map-course",
  "build-training-plan",
  "compose-study-lesson",
  "explain-course-concept",
  "generate-adaptive-practice",
  "evaluate-learner-response",
  "generate-course-quiz",
  "plan-remediation",
  "audit-learning-artifact",
]);

export type CodexTask = z.infer<typeof CodexTaskSchema>;

export const CodexStatusResponseSchema = z.object({
  installed: z.boolean(),
  authenticated: z.boolean(),
  ready: z.boolean(),
  version: z.string().nullable(),
  detail: z.string().nullable(),
});

export type CodexStatusResponse = z.infer<typeof CodexStatusResponseSchema>;
