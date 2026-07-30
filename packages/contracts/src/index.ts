export const API_VERSION = "v1" as const;

export interface HealthResponse {
  status: "ok";
  service: "local-learning-studio";
  apiVersion: typeof API_VERSION;
}

export interface CourseSummary {
  id: string;
  title: string;
  sourceCount: number;
  updatedAt: string;
}

