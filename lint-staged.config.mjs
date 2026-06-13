// Wrap each path in double quotes so filenames with spaces survive the shell.
const quote = (f) => `"${f}"`;
const list = (files) => files.map(quote).join(" ");

// ESLint's flat config resolves from the current working directory, and there
// is no root eslint.config.js (each workspace owns its own). Driving ESLint
// through the workspace's own `lint:staged` script runs it with the right cwd
// and binary resolution — identical to how `npm run lint` works in CI.
// Both commands share one glob, so they run sequentially on the same files:
// eslint --fix and prettier --write never race on the same file.
const lintWorkspace = (workspace) => (files) => [
  `npm run lint:staged --workspace=${workspace} -- ${list(files)}`,
  `prettier --write ${list(files)}`,
];

const prettierOnly = (files) =>
  `prettier --write --ignore-unknown ${list(files)}`;

export default {
  "apps/backend/**/*.{ts,js,mjs,cjs}": lintWorkspace("apps/backend"),
  "apps/frontend/**/*.{ts,tsx,js,jsx}": lintWorkspace("apps/frontend"),

  // Everything else Prettier understands (docs, config, styles), anywhere in
  // the tree. .prettierignore still protects lockfiles & generated output.
  "**/*.{json,jsonc,md,yml,yaml,css,html}": prettierOnly,

  // Root-level scripts/config (e.g. this file) — top level only.
  "*.{js,mjs,cjs}": prettierOnly,
};
