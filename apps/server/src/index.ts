import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { buildApp } from "./app.js";

if (existsSync(".env")) loadEnvFile();

const port = Number.parseInt(process.env.PORT ?? "4318", 10);
const host = process.env.HOST ?? "127.0.0.1";
const app = buildApp({
  databasePath: process.env.DATABASE_PATH,
  courseRoot: process.env.COURSE_ROOT,
});

try {
  await app.listen({ host, port });
  app.log.info(`Local Learning Studio is listening on http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
