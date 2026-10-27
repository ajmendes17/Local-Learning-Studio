import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { join } from "node:path";
import { buildApp, findProjectRoot } from "./app.js";

const environmentFile = join(findProjectRoot(), ".env");
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

const port = Number.parseInt(process.env.PORT ?? "4318", 10);
const host = process.env.HOST ?? "127.0.0.1";
const app = buildApp({
  databasePath: process.env.DATABASE_PATH,
  courseRoot: process.env.COURSE_ROOT,
  canvas: {
    baseUrl: process.env.CANVAS_BASE_URL ?? "https://canvas.instructure.com",
    token: process.env.CANVAS_ACCESS_TOKEN,
  },
});

try {
  await app.listen({ host, port });
  app.log.info(`Local Learning Studio is listening on http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
