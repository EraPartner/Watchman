#!/usr/bin/env node

// The desktop bundle installs the backend from its standalone lockfile
// (apps/desktop/scripts/stage-backend.mjs runs `npm ci` there). Dependabot
// only updates the root lockfile, so a backend dependency bump leaves
// apps/backend/package-lock.json behind and `npm ci` refuses it. This check
// is offline: it compares the declared specs, not the resolved tree.

import { readFileSync } from "node:fs";

const manifestPath = "apps/backend/package.json";
const lockPath = "apps/backend/package-lock.json";
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const manifest = readJson(manifestPath);
const lockRoot = readJson(lockPath).packages?.[""] ?? {};

const mismatches = [];
for (const field of dependencyFields) {
  const declared = manifest[field] ?? {};
  const locked = lockRoot[field] ?? {};
  const names = new Set([...Object.keys(declared), ...Object.keys(locked)]);
  for (const name of names) {
    if (declared[name] !== locked[name]) {
      mismatches.push({
        field,
        name,
        packageJson: declared[name] ?? null,
        lockfile: locked[name] ?? null,
      });
    }
  }
}

if (mismatches.length > 0) {
  console.error(`${lockPath} is out of sync with ${manifestPath}:`);
  console.error(JSON.stringify(mismatches, null, 2));
  // Outside the repo, so npm doesn't resolve it as a workspace of the root.
  console.error(
    "Regenerate it: copy apps/backend/package.json and package-lock.json to an empty temp dir, run `npm install --package-lock-only --ignore-scripts --allow-git=all` there, and copy package-lock.json back."
  );
  process.exit(1);
}
console.log(`${lockPath} matches ${manifestPath}.`);
