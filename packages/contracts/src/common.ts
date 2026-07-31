import { z } from "zod";

export const API_VERSION = "v1" as const;

export interface HealthResponse {
  status: "ok";
  service: "local-learning-studio";
  apiVersion: typeof API_VERSION;
}

export const ApiErrorSchema = z.object({
  error: z.string(),
  detail: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

