# Watchman documentation rules

These files form an Obsidian knowledge base.

- Keep YAML frontmatter fields `title`, `type`, `status`, `date`, `tags`, `description`, and
  `aliases` on every page.
- Update the date when changing a page.
- Preserve wikilinks, embeds, callouts, and cross-references. Use an available Obsidian Markdown
  skill for Obsidian Flavored Markdown, or follow the existing vault syntax directly.
- Use plain repository file tools in the dev container. The Obsidian CLI and Defuddle require host
  applications or network access.
- Keep docs aligned with code, but do not rewrite historical ADRs. Add a superseding ADR.
- Synchronize affected docs after the implementation diff is stable and before final validation.
  Run documentation and generated-artifact checks after the docs update. If validation changes the
  implementation, check the docs again.
