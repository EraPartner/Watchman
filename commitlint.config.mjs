// Conventional Commits enforcement for the commit-msg hook (.githooks/commit-msg).
// Mirrors the style already in git history: type(scope): subject —
// e.g. feat/fix/chore/docs/refactor. Allowed types/rules come from
// @commitlint/config-conventional; override here if the project needs to diverge.
export default {
  extends: ["@commitlint/config-conventional"],
};
