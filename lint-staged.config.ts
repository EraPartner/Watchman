// Wrap each path in double quotes so filenames with spaces survive the shell.
type FileCommands = (files: readonly string[]) => string | string[];

const quote = (f: string): string => `"${f}"`;
const list = (files: readonly string[]): string => files.map(quote).join(" ");

// ESLint's flat config resolves from the current working directory, and there
// is no root eslint.config.ts (each workspace owns its own). Driving ESLint
// through the workspace's own `lint:staged` script runs it with the right cwd
// and binary resolution — identical to how `npm run lint` works in CI.
// Both commands share one glob, so they run sequentially on the same files:
// eslint --fix and prettier --write never race on the same file.
const lintWorkspace =
  (workspace: string): FileCommands =>
  (files) => [
    `npm run lint:staged --workspace=${workspace} -- ${list(files)}`,
    `prettier --write ${list(files)}`,
  ];

const prettierOnly: FileCommands = (files) =>
  `prettier --write --ignore-unknown ${list(files)}`;

const config: Record<string, FileCommands> = {
  "apps/backend/**/*.ts": lintWorkspace("apps/backend"),
  "apps/frontend/**/*.{ts,tsx}": lintWorkspace("apps/frontend"),

  // Desktop (Electron shell) ships no ESLint config of its own — Prettier-format
  // its sources on commit so they don't drift from the rest of the tree.
  "apps/desktop/**/*.{ts,tsx}": prettierOnly,

  // Everything else Prettier understands (docs, config, styles), anywhere in
  // the tree. .prettierignore still protects lockfiles & generated output.
  "**/*.{json,jsonc,md,yml,yaml,css,html}": prettierOnly,

  // Root-level config (e.g. this file), scripts/ and config/.
  "{*,scripts/**/*,config/**/*}.ts": prettierOnly,
};

export default config;
