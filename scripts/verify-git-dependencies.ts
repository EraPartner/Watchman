#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const packageName = "node-roon-api-transport";
const commit = "2ee60008a4cdb90c34ff3de58bb4b949067f1d20";
const expectedSpec = `github:RoonLabs/node-roon-api-transport#${commit}`;
const expectedResolved = `git+ssh://git@github.com/RoonLabs/node-roon-api-transport.git#${commit}`;
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

type Json = Record<string, unknown>;

/** The object stored under `key`, or an empty one when it is missing. */
function objectAt(obj: Json, key: string): Json {
  const value = obj[key];
  return typeof value === "object" && value !== null ? (value as Json) : {};
}
interface GitSpec {
  path: string;
  field: string;
  name: string;
  spec: string;
}
interface ResolvedGitEntry {
  path: string;
  resolved: string;
}

function readJson(path: string): Json {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${path} is not a JSON object`);
  }
  return parsed as Json;
}

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
}

function isGitSpec(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (/^(?:git(?:\+[^:]+)?|github|gitlab|bitbucket):/.test(value) ||
      /^git@/.test(value) ||
      /^https?:\/\/[^#]+\.git(?:#|$)/.test(value) ||
      /^[^/@\s]+\/[^/\s#]+(?:#.*)?$/.test(value))
  );
}

function workspaceManifests(): string[] {
  const paths = ["package.json"];
  for (const parent of ["apps", "packages"]) {
    try {
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory())
          paths.push(join(parent, entry.name, "package.json"));
      }
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
  }
  return paths;
}

const manifestGitSpecs: GitSpec[] = [];
for (const path of workspaceManifests()) {
  let manifest: Json;
  try {
    manifest = readJson(path);
  } catch (error) {
    if (errorCode(error) === "ENOENT") continue;
    throw error;
  }
  for (const field of dependencyFields) {
    for (const [name, spec] of Object.entries(objectAt(manifest, field))) {
      if (isGitSpec(spec)) manifestGitSpecs.push({ path, field, name, spec });
    }
  }
}

const lock = readJson("package-lock.json");
const lockGitSpecs: GitSpec[] = [];
const resolvedGitEntries: ResolvedGitEntry[] = [];
for (const [path, value] of Object.entries(objectAt(lock, "packages"))) {
  const pkg =
    typeof value === "object" && value !== null ? (value as Json) : {};
  for (const field of dependencyFields) {
    for (const [name, spec] of Object.entries(objectAt(pkg, field))) {
      if (isGitSpec(spec)) lockGitSpecs.push({ path, field, name, spec });
    }
  }
  const resolved = pkg["resolved"];
  if (typeof resolved === "string" && resolved.startsWith("git+")) {
    resolvedGitEntries.push({ path, resolved });
  }
}

const expectedManifest = {
  path: "apps/backend/package.json",
  field: "dependencies",
  name: packageName,
  spec: expectedSpec,
};
const expectedLockSpec = {
  path: "apps/backend",
  field: "dependencies",
  name: packageName,
  spec: expectedSpec,
};
const expectedLockEntry = {
  path: `node_modules/${packageName}`,
  resolved: expectedResolved,
};

function requireOnly(label: string, actual: unknown[], expected: object): void {
  if (JSON.stringify(actual) !== JSON.stringify([expected])) {
    console.error(
      `${label} must contain only the reviewed Roon transport pin.`
    );
    console.error(JSON.stringify(actual, null, 2));
    process.exit(1);
  }
}

requireOnly("Workspace Git dependencies", manifestGitSpecs, expectedManifest);
requireOnly("Lockfile Git dependency specs", lockGitSpecs, expectedLockSpec);
requireOnly(
  "Lockfile resolved Git entries",
  resolvedGitEntries,
  expectedLockEntry
);
console.log(`Verified sole Git dependency: ${packageName}@${commit}`);
