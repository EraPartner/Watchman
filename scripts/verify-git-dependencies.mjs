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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isGitSpec(value) {
  return (
    typeof value === "string" &&
    (/^(?:git(?:\+[^:]+)?|github|gitlab|bitbucket):/.test(value) ||
      /^git@/.test(value) ||
      /^https?:\/\/[^#]+\.git(?:#|$)/.test(value) ||
      /^[^/@\s]+\/[^/\s#]+(?:#.*)?$/.test(value))
  );
}

function workspaceManifests() {
  const paths = ["package.json"];
  for (const parent of ["apps", "packages"]) {
    try {
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory())
          paths.push(join(parent, entry.name, "package.json"));
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return paths;
}

const manifestGitSpecs = [];
for (const path of workspaceManifests()) {
  let manifest;
  try {
    manifest = readJson(path);
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  for (const field of dependencyFields) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (isGitSpec(spec)) manifestGitSpecs.push({ path, field, name, spec });
    }
  }
}

const lock = readJson("package-lock.json");
const lockGitSpecs = [];
const resolvedGitEntries = [];
for (const [path, pkg] of Object.entries(lock.packages ?? {})) {
  for (const field of dependencyFields) {
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
      if (isGitSpec(spec)) lockGitSpecs.push({ path, field, name, spec });
    }
  }
  if (typeof pkg.resolved === "string" && pkg.resolved.startsWith("git+")) {
    resolvedGitEntries.push({ path, resolved: pkg.resolved });
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

function requireOnly(label, actual, expected) {
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
