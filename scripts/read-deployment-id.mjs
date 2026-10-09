import {readFileSync, existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--project-root");
const projectRoot = rootIndex >= 0 ? path.resolve(args[rootIndex + 1]) : fileURLToPath(new URL("../", import.meta.url));
try {
  const builtConfig = path.join(projectRoot, "dist/server/wrangler.json");
  const sourceConfig = path.join(projectRoot, "config/deployment.json");
  const databaseId = existsSync(builtConfig)
    ? JSON.parse(readFileSync(builtConfig, "utf8")).d1_databases?.[0]?.database_id
    : !args.includes("--built-only") && existsSync(sourceConfig) ? JSON.parse(readFileSync(sourceConfig, "utf8")).d1DatabaseId : undefined;
  if (typeof databaseId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(databaseId) || databaseId === "00000000-0000-4000-8000-000000000000") throw new Error("Deployment database ID is missing, invalid or a placeholder.");
  process.stdout.write(databaseId + "\n");
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : "Cannot read deployment configuration.") + "\n");
  process.exitCode = 1;
}
