import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { projectRoot } from "./sites-env.mjs";

const target = process.argv[2];
if (!["local", "remote"].includes(target)) throw new Error("Choose local or remote database migration.");
const config = fileURLToPath(new URL("../dist/server/wrangler.json", import.meta.url));
if (!existsSync(config)) throw new Error("Run pnpm run build before migrating login tables.");
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)),
  "d1", "execute", "DB", `--${target}`, "--config", config,
  ...(target === "local" ? ["--persist-to", ".wrangler/state"] : []),
  "--file", fileURLToPath(new URL("../drizzle/0001_dual_login.sql", import.meta.url)),
], { cwd: projectRoot, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
