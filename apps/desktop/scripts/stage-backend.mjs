// Stage a self-contained, production-only copy of the backend for packaging.
//
// Why: in this npm-workspaces monorepo the backend's runtime dependencies are
// hoisted to the repo-root node_modules, so `apps/backend/node_modules` is
// nearly empty. electron-builder copies that directory verbatim, producing an
// app whose bundled backend can't resolve `dotenv` (and everything else). Here
// we materialise a complete production dependency tree from the backend's
// standalone lockfile into apps/backend/.bundle, which electron-builder then
// bundles (see extraResources in electron-builder.yml).
//
// `--ignore-scripts` is safe: the only native dep, @duckdb/node-api, ships a
// prebuilt .node via a platform package (no build step). The arch-specific
// binding is why the mac target is arm64-only.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(here, "..", "..", "backend");
const stageDir = join(backendDir, ".bundle");

const distDir = join(backendDir, "dist");
if (!existsSync(join(distDir, "index.js"))) {
  console.error(
    "[stage-backend] apps/backend/dist/index.js not found — run `npm run build:backend` first."
  );
  process.exit(1);
}

console.log("[stage-backend] staging production backend →", stageDir);
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

cpSync(join(backendDir, "package.json"), join(stageDir, "package.json"));
cpSync(
  join(backendDir, "package-lock.json"),
  join(stageDir, "package-lock.json")
);
cpSync(distDir, join(stageDir, "dist"), { recursive: true });
const envExample = join(backendDir, ".env.example");
if (existsSync(envExample)) cpSync(envExample, join(stageDir, ".env.example"));

// Isolated production install (the .bundle dir is not a workspace member, so
// npm treats it standalone).
execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts"], {
  cwd: stageDir,
  stdio: "inherit",
});

const nodeModules = join(stageDir, "node_modules");
if (!existsSync(join(nodeModules, "dotenv"))) {
  console.error(
    "[stage-backend] production install did not yield dotenv — aborting."
  );
  process.exit(1);
}
console.log(
  `[stage-backend] done — ${readdirSync(nodeModules).length} modules staged.`
);
