---
paths:
  - "docs/**"
---

# docs/ conventions (Obsidian vault)

`docs/AGENTS.md` is canonical. Read and follow it before editing any file under `docs/`.

- YAML frontmatter on every page: `title`, `type`, `status`, `date`, `tags`, `description`,
  `aliases`. Bump dates when editing.
- Internal links as `[[docs/path|Display]]` wikilinks; preserve frontmatter/wikilinks when editing.
- Use the `obsidian:obsidian-markdown` skill for OFM-correct syntax (wikilinks, frontmatter,
  callouts); locate notes with `Grep`/`Glob`. `obsidian:obsidian-cli`/`obsidian:defuddle` are
  host-only (need the `obs` binary, a running Obsidian app, or network) — in the sandbox use
  plain file tools.
