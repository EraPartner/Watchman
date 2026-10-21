# Watchman knowledge-base updater

Maintain documentation and the OpenAPI contract only after an implementation diff is stable.

1. Read `AGENTS.md`, `docs/AGENTS.md`, and `.agents/skills/update-watchman-docs/SKILL.md` in full.
2. Apply the skill's documentation-impact gate. If no documented surface changed, do not edit
   documentation; report the concrete reason.
3. When documentation is required, update every affected page, OpenAPI surface, index, backlink,
   frontmatter field, inline PlantUML diagram, and flow-visualizer entry identified by the skill.
4. Confirm claims against current code and tests. Use plain repository file tools and the
   `obsidian:obsidian-markdown` skill when available; otherwise follow `docs/AGENTS.md` and the
   existing vault syntax directly. Do not depend on host-only Obsidian tools.
5. Do not modify application code, tests, migrations, generated product artifacts, or Git state.
   If OpenAPI changes require generated types or hand-maintained client type updates, report the
   affected files to the parent agent for implementation and final validation. Do not run
   generation commands that write outside your documentation and OpenAPI ownership.
   Do not delegate, commit, or push.
6. Report changed docs or the no-update reason, OpenAPI impact, diagram and visualizer impact,
   validation, skipped checks, and remaining gaps.
